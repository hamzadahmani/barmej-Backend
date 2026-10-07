import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {ZodError} from 'zod';
import {discoveryRouter} from '../src/discovery';

const db = vi.hoisted(() => ({
  user: {findUniqueOrThrow: vi.fn()}, place: {findMany: vi.fn()},
  favorite: {findMany: vi.fn()}, userVideoState: {findMany: vi.fn()}, placeEvent: {findMany: vi.fn()},
}));
vi.mock('../src/db', () => ({prisma: db}));
vi.mock('../src/auth', () => ({requireAuth: (req: any, res: any, next: any) => {
  if (req.headers.authorization !== 'Bearer test') return res.sendStatus(401);
  req.userId = 11; next();
}}));
const availability = vi.fn();
const server = express();
server.use('/v1/discovery', discoveryRouter(availability));
server.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error instanceof ZodError ? 400 : 500).json({message: 'failure'}));
const get = (query = '') => request(server).get(`/v1/discovery${query}`).set('Authorization', 'Bearer test');
const makePlace = (id: number, overrides: object = {}) => ({id, name: `Place ${id}`, categoryId: 1, category: {name: 'Restaurants'}, categories: [], media: [], reviews: [], reviewsEnabled: true, ambienceTags: [], averagePrice: 20, latitude: 36.8, longitude: 10.1, createdAt: new Date('2026-09-01'), ...overrides});
beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-09-15T12:10:00Z'));
  db.user.findUniqueOrThrow.mockResolvedValue({interests: ['gaming'], preferredBudget: 30, favoriteAmbiences: []});
  db.place.findMany.mockResolvedValue([makePlace(1), makePlace(2, {name: 'Gaming', category: {name: 'Loisirs'}, happyHour: '18h à 19h'})]);
  db.favorite.findMany.mockResolvedValue([]); db.userVideoState.findMany.mockResolvedValue([]); db.placeEvent.findMany.mockResolvedValue([]);
  availability.mockReset().mockResolvedValue({slots: [{time: '12:00', status: 'PAST', available: false}, {time: '12:30', status: 'AVAILABLE', available: true}]});
});
afterEach(() => vi.useRealTimers());
describe('discovery API', () => {
  it('requires authentication and rejects invalid coordinates and interest keys', async () => {
    expect((await request(server).get('/v1/discovery')).status).toBe(401);
    expect((await get('?latitude=36')).status).toBe(400);
    expect((await get('?latitude=999&longitude=10')).status).toBe(400);
    expect((await get('?interest=unknown')).status).toBe(400);
    expect((await get('?recent=1,invalid')).status).toBe(400);
  });
  it('ranks a matching interest ahead of generic places and returns twelve interests', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body.forYou[0].idPlace).toBe(2);
    expect(response.body.interests).toHaveLength(12);
    expect(response.body.forYou[0]).toMatchObject({rating: null, reviewCount: 0});
    expect(response.body.offers).toHaveLength(1);
    expect(response.body.nearby).toEqual([]);
    expect(db.favorite.findMany).toHaveBeenCalledWith({where: {userId: 11}, select: {placeId: true}});
  });
  it('filters by a real interest, not the three legacy category ids', async () => {
    const response = await get('?interest=gaming');
    expect(response.body.map((place: any) => place.idPlace)).toEqual([2]);
    expect(availability).not.toHaveBeenCalled();
  });
  it('hides full, closed, and not-yet-open places from available now', async () => {
    availability.mockResolvedValueOnce({slots: [{time: '12:00', status: 'CLOSED', available: false}, {time: '12:30', available: true}]}).mockResolvedValueOnce({slots: [{time: '12:00', available: false}, {time: '12:30', available: false}]});
    expect((await get()).body.availableNow).toEqual([]);
    availability.mockResolvedValue({slots: [{time: '12:30', available: true}]});
    expect((await get()).body.availableNow).toEqual([]);
  });
  it('returns recent history in order, nearby distances and only genuine new places', async () => {
    db.place.findMany.mockResolvedValue([makePlace(1, {createdAt: new Date('2025-01-01')}), makePlace(2)]);
    const response = await get('?recent=2,1,2&latitude=36.8&longitude=10.1');
    expect(response.body.recent.map((place: any) => place.idPlace)).toEqual([2, 1]);
    expect(response.body.newPlaces.map((place: any) => place.idPlace)).toEqual([2]);
    expect(response.body.nearby[0].distance).toBe(0);
    expect(response.body.availableNow[0].availableTime).toBe('12:30');
  });
});
