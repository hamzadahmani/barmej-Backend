import express from 'express';
import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
const db = vi.hoisted(() => ({placeMenu: {findMany: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), updateMany: vi.fn()}}));
const ocr = vi.hoisted(() => vi.fn());
vi.mock('../src/db', () => ({prisma: db}));
vi.mock('../src/config', () => ({config: {}}));
vi.mock('../src/menuOcr', () => ({extractMenuPhoto: ocr}));
import {createMenuRouter} from '../src/menus';
const app = express();
app.use(express.json());
app.use('/pro/places/:placeId/menus', createMenuRouter(async (_req, res, placeId) => {
  if (placeId === 7) return true;
  res.sendStatus(403); return false;
}));
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.name === 'ZodError' ? 400 : 500).json({message: 'Invalid request'}));
const stamp = new Date('2026-10-01T12:00:00Z');
const item = {name: 'Café crème', priceMillimes: 4500, kind: 'DRINK', available: true};
beforeEach(() => {
  vi.clearAllMocks();
  db.placeMenu.findFirst.mockResolvedValue({id: 91, placeId: 7, imageUrl: 'https://res.cloudinary.com/demo/menu.png', items: [], draftItems: [], updatedAt: stamp});
  db.placeMenu.findFirstOrThrow.mockResolvedValue({id: 91, items: [item], active: true, validatedAt: stamp, updatedAt: stamp});
  db.placeMenu.updateMany.mockResolvedValue({count: 1});
  ocr.mockResolvedValue({text: 'Café crème 4.500 DT', items: [item]});
});
describe('Photo menu publication safeguards', () => {
  it('denies another establishment before reading its menus', async () => {
    expect((await request(app).get('/pro/places/8/menus')).status).toBe(403);
    expect(db.placeMenu.findMany).not.toHaveBeenCalled();
  });
  it('publishes only explicitly reviewed prices and rejects stale edits', async () => {
    const url = '/pro/places/7/menus/91/validate';
    const body = {items: [item], updatedAt: stamp.toISOString()};
    expect((await request(app).post(url).send(body)).status).toBe(400);
    expect(db.placeMenu.updateMany).not.toHaveBeenCalled();
    expect((await request(app).post(url).send({...body, reviewed: true})).status).toBe(200);
    expect(db.placeMenu.updateMany).toHaveBeenCalledWith({where: {id: 91, placeId: 7, updatedAt: stamp}, data: {items: [item], draftItems: [item], active: true, validatedAt: expect.any(Date)}});
    db.placeMenu.updateMany.mockResolvedValue({count: 0});
    expect((await request(app).post(url).send({...body, reviewed: true})).status).toBe(409);
  });
  it('keeps OCR output in the draft without publishing it', async () => {
    expect((await request(app).post('/pro/places/7/menus/91/extract')).status).toBe(202);
    await new Promise(resolve => setImmediate(resolve));
    expect(db.placeMenu.updateMany).toHaveBeenCalledWith({where: {id: 91, placeId: 7, updatedAt: stamp}, data: {draftItems: [item], ocrText: 'Café crème 4.500 DT'}});
    const status = await request(app).get('/pro/places/7/menus/91/extraction');
    expect(status.body.state).toBe('READY');
    expect(status.body.menu.items).toEqual([]);
  });
  it('scopes unavailable menus and disabling to the managed place', async () => {
    db.placeMenu.findFirst.mockResolvedValue(null);
    expect((await request(app).post('/pro/places/7/menus/92/extract')).status).toBe(404);
    expect(ocr).not.toHaveBeenCalled();
    expect((await request(app).patch('/pro/places/7/menus/91/disable')).status).toBe(200);
    expect(db.placeMenu.updateMany).toHaveBeenCalledWith({where: {id: 91, placeId: 7}, data: {active: false}});
  });
});
