import express from 'express';
import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const db = vi.hoisted(() => ({
  place: {findFirst: vi.fn(), findMany: vi.fn()},
  $queryRaw: vi.fn(),
  barmejliPlan: {create: vi.fn(), findFirst: vi.fn(), update: vi.fn()},
  barmejliStep: {update: vi.fn()},
  $transaction: vi.fn(),
}));
const forecast = vi.hoisted(() => vi.fn());
vi.mock('../src/db', () => ({prisma: db}));
vi.mock('../src/weather', () => ({getForecast: forecast, weatherChanged: vi.fn()}));
import {barmejliRouter} from '../src/barmejli';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).userId = 7; next(); });
app.use('/v1/barmejli', barmejliRouter);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? (error.name === 'ZodError' ? 400 : 500)).json({message: error.message}));

const place = (id: number, category: string) => ({
  id, name: `Lieu réel ${id}`, subtitle: 'Expérience réelle', latitude: 36.8, longitude: 10.18,
  category: {name: category}, openingHours: [], closures: [], experiences: [], averagePrice: 5,
  defaultDurationMin: 30, suitabilityMoods: ['calme'], ambienceTags: [], groupTypes: ['amis'],
  environment: 'INDOOR', weatherSensitive: false,
});
describe('Barmejli HTTP generation contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$queryRaw.mockRejectedValue(new Error('PostGIS unavailable in fixture'));
    db.place.findFirst.mockResolvedValue({latitude: 36.8, longitude: 10.18});
    db.place.findMany.mockResolvedValue([place(1, 'café'), place(2, 'activité'), place(3, 'restaurant')]);
    forecast.mockResolvedValue({observedAt: new Date().toISOString(), temperatureC: 25, precipitationProbability: 0, windKph: 0, adverse: false});
    db.barmejliPlan.create.mockImplementation(async ({data}: any) => ({...data, id: 42, status: 'DRAFT', steps: data.steps.create.map((step: any, index: number) => ({...step, experienceId: step.experienceId ?? null, id: index + 1, place: {address: 'Tunis', image: null, latitude: 36.8, longitude: 10.18, category: {name: step.placeId === 1 ? 'café' : 'activité'}}}))}));
  });
  it('returns real steps, explanations and consistent totals to the mobile application', async () => {
    const response = await request(app).post('/v1/barmejli/generate').send({prompt: 'Sortie calme à Tunis samedi 30 DT, sans restaurant'});
    expect(response.status).toBe(201);
    expect(response.body.request.budget).toBe(30);
    expect(response.body.totals.cost).toBe(response.body.steps.reduce((sum: number, step: any) => sum + step.estimatedCost, 0));
    expect(response.body.steps.some((step: any) => step.placeId === 3)).toBe(false);
    expect(response.body.explanation.travelNote).toContain('estimés');
    expect(response.body.steps.every((step: any) => step.reason && step.placeName.startsWith('Lieu réel'))).toBe(true);
  });
  it('does not silently relocate an unknown city to La Marsa', async () => {
    db.place.findFirst.mockResolvedValue(null);
    const response = await request(app).post('/v1/barmejli/generate').send({prompt: 'Sortie à Sousse samedi 30 DT'});
    expect(response.status).toBe(422);
    expect(forecast).not.toHaveBeenCalled();
    expect(db.barmejliPlan.create).not.toHaveBeenCalled();
  });
  it('requires a coordinate pair and clarifies ambiguous per-person budgets', async () => {
    expect((await request(app).post('/v1/barmejli/generate').send({prompt: 'Sortie à Tunis 30 DT', latitude: 36.8})).status).toBe(400);
    const response = await request(app).post('/v1/barmejli/generate').send({prompt: 'Sortie en couple 30 DT par personne'});
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('budget total');
    expect(db.barmejliPlan.create).not.toHaveBeenCalled();
  });
  it('keeps old saved programmes readable even when their prompt now needs clarification', async () => {
    await request(app).post('/v1/barmejli/generate').send({prompt: 'Sortie à Tunis samedi 30 DT'});
    const saved = await db.barmejliPlan.create.mock.results[0]!.value;
    db.barmejliPlan.findFirst.mockResolvedValue({...saved, originalPrompt: 'Sortie en couple 30 DT par personne'});
    const response = await request(app).get('/v1/barmejli/42');
    expect(response.status).toBe(200);
    expect(response.body.steps).toHaveLength(saved.steps.length);
    expect(response.body.explanation.assumptions).toContain('Paramètres du programme sauvegardé conservés.');
  });
  it('recalculates and stores the whole programme atomically when replacing a stop', async () => {
    await request(app).post('/v1/barmejli/generate').send({prompt: 'Sortie à Tunis samedi à 18h 30 DT pendant 2 heures sans restaurant'});
    const saved = await db.barmejliPlan.create.mock.results[0]!.value;
    db.barmejliPlan.findFirst.mockResolvedValue(saved);
    db.place.findMany.mockResolvedValue([place(1, 'café'), place(2, 'activité'), {...place(4, 'activité'), defaultDurationMin: 45, latitude: 36.81}]);
    db.$transaction.mockImplementation(async work => work(db));
    db.barmejliStep.update.mockImplementation(async ({where, data}: any) => {
      const step = saved.steps.find((item: any) => item.id === where.id);
      Object.assign(step, data);
      return step;
    });
    db.barmejliPlan.update.mockImplementation(async ({data}: any) => Object.assign(saved, data));
    const response = await request(app).post('/v1/barmejli/42/steps/1/replace');
    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.barmejliStep.update).toHaveBeenCalledTimes(2);
    expect(response.body.steps[1].placeId).toBe(4);
    expect(response.body.steps[1].travelMinutes).toBeGreaterThan(0);
    expect(response.body.totals.durationMin).toBeGreaterThan(75);
  });
});
