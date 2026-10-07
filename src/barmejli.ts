import {menuOptions, menuSelectionKey} from './menuLogic';
import {Prisma, VenueEnvironment} from '@prisma/client';
import {Router} from 'express';
import {z} from 'zod';
import {AuthRequest} from './auth';
import {buildLocalItinerary, rebuildItinerary, Candidate, cityCenter, cityKey, haversineKm, LOCAL_RADIUS_KM, ParsedOuting, parseOutingPrompt, roleFor, searchRadii, Weather} from './barmejliLogic';
import {prisma} from './db';
import {getForecast, weatherChanged} from './weather';

export const barmejliRouter = Router();
const route = (handler: (req: any, res: any) => Promise<unknown>) => (req: any, res: any, next: any) => Promise.resolve(handler(req, res)).catch(next);
const userId = (req: AuthRequest) => req.userId;
const positiveId = (value: unknown) => z.coerce.number().int().positive().parse(value);

const requestSchema = z.object({
  prompt: z.string().trim().min(8).max(500),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  scheduledAt: z.coerce.date().optional(),
  budget: z.number().int().min(0).max(10_000).optional(),
  mood: z.string().trim().min(2).max(40).optional(),
  groupType: z.string().trim().min(2).max(40).optional(),
}).refine(value => (value.latitude === undefined) === (value.longitude === undefined), {message: 'Indiquez la latitude et la longitude ensemble.'});

function categoryName(value: string) {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/restaurant|diner|dejeuner/.test(text)) return 'restaurant';
  if (/cafe|brunch|patisserie/.test(text)) return 'cafe';
  return 'activity';
}

async function resolveLocation(input: ParsedOuting, latitude?: number, longitude?: number) {
  if (latitude !== undefined && longitude !== undefined) return {latitude, longitude};
  const known = cityCenter(input.city);
  if (known) return known;
  // Ville hors référentiel : centre des adresses qui la mentionnent (et non la première trouvée).
  const matches = await prisma.place.findMany({
    where: {address: {contains: input.city, mode: 'insensitive'}},
    select: {latitude: true, longitude: true},
    take: 50,
  });
  const valid = matches.filter(place => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
  if (valid.length) {
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    return {latitude: median(valid.map(place => place.latitude)), longitude: median(valid.map(place => place.longitude))};
  }
  throw Object.assign(new Error('Aucune adresse de cette ville n’est encore disponible. Choisissez une ville référencée dans Barmej.'), {statusCode: 422});
}

async function nearbyPlaceIds(latitude: number, longitude: number) {
  try {
    const rows = await prisma.$queryRaw<Array<{id: number}>>(Prisma.sql`
      SELECT "id_place" AS id FROM "places"
      WHERE "location" IS NOT NULL
        AND ST_DWithin("location", ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, 25000)
      LIMIT 150
    `);
    return rows.map(row => row.id);
  } catch {
    return undefined; // Local/test databases without PostGIS retain the Haversine path.
  }
}

async function loadCandidates(latitude: number, longitude: number, scheduledAt: Date, participants = 1): Promise<Candidate[]> {
  const ids = await nearbyPlaceIds(latitude, longitude);
  const start = new Date(scheduledAt);
  start.setDate(start.getDate() - 1);
  const end = new Date(scheduledAt);
  end.setDate(end.getDate() + 1);
  const places = await prisma.place.findMany({
    where: ids?.length ? {id: {in: ids}} : undefined,
    include: {
      category: true,
      menus: {where: {active: true, validatedAt: {not: null}}},
      openingHours: true,
      closures: {where: {date: {gte: start, lte: end}}},
      experiences: {where: {active: true}},
    },
    take: 150,
  });
  // Les maisons d'hôtes sont des séjours (à la nuit), pas des étapes d'une sortie.
  const isStay = (name: string) => /maison|h[oô]te|g[iî]te|h[ée]bergement/i.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const candidates = places.filter(place => !isStay(place.category.name)).flatMap(place => {
    const common = {
      placeId: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude,
      openingHours: place.openingHours,
      closureDates: place.closures.map(item => item.date.toISOString().slice(0, 10)),
    };
    const experiences = place.experiences.map(experience => ({
      ...common,
      experienceId: experience.id,
      title: experience.name,
      category: categoryName(experience.category),
      style: `${experience.name} ${(experience.keywords ?? []).join(' ')}`,
      role: roleFor(categoryName(experience.category), `${experience.name} ${(experience.keywords ?? []).join(' ')}`),
      price: experience.price,
      durationMin: experience.durationMin,
      moods: experience.suitabilityMoods,
      groupTypes: experience.groupTypes,
      environment: experience.environment,
      weatherSensitive: experience.weatherSensitive,
      minTemperatureC: experience.minTemperatureC,
      maxTemperatureC: experience.maxTemperatureC,
      maxWindKph: experience.maxWindKph,
    }));
    const style = `${place.subtitle ?? ''} ${place.cuisineType ?? ''} ${place.category.name}`;
    const base: Candidate = {
      ...common,
      title: place.subtitle ?? place.name,
      category: categoryName(place.category.name),
      style,
      role: roleFor(categoryName(place.category.name), style),
      price: place.averagePrice ?? Number.NaN,
      durationMin: place.defaultDurationMin,
      moods: place.suitabilityMoods.length ? place.suitabilityMoods : place.ambienceTags,
      groupTypes: place.groupTypes,
      environment: place.environment,
      weatherSensitive: place.weatherSensitive,
    };
    const category = categoryName(place.category.name);
    const selections = category === 'restaurant' || category === 'cafe' ? menuOptions(category, place.menus ?? [], scheduledAt, participants) : [];
    if (selections.length) return [...experiences.filter(item => item.category === 'activity'), ...selections.map(menuSelection => ({...base, title: menuSelection.items.map(item => item.name).join(' + '), price: Math.ceil(menuSelection.totalMillimes / 1000), menuSelection}))];
    return experiences.length ? experiences : [base];
  });
  const origin = {latitude, longitude};
  return candidates
    .map(candidate => ({...candidate, originDistanceKm: haversineKm(origin, candidate)}))
    .filter(candidate => candidate.originDistanceKm <= 25);
}

const planInclude = {steps: {orderBy: {position: 'asc' as const}, include: {place: {select: {image: true, address: true, latitude: true, longitude: true, category: {select: {name: true}}}}, experience: {select: {category: true}}}}};
function interpretationNotes(plan: any): string[] {
  // Saved programmes created before this upgrade must remain readable.
  try {
    const parsed = parseOutingPrompt(plan.originalPrompt, new Date(plan.scheduledAt));
    const notes = (parsed.assumptions ?? []).filter(note =>
      (!note.startsWith('Budget') || parsed.budget === plan.budget) &&
      (!note.startsWith('Zone') || parsed.city === plan.city));
    const farthest = Math.max(0, ...(plan.steps ?? []).map((step: any) =>
      step.place?.latitude != null ? haversineKm({latitude: plan.latitude, longitude: plan.longitude}, step.place) : 0));
    if (cityKey(plan.city) !== 'grand tunis' && farthest > LOCAL_RADIUS_KM + 0.5) {
      notes.push(`Peu d’adresses référencées à ${plan.city} pour ces critères : programme élargi aux environs (jusqu’à ${Math.ceil(farthest)} km).`);
    }
    return notes;
  } catch {
    return ['Paramètres du programme sauvegardé conservés.'];
  }
}
const planDto = (plan: any) => ({
  id: plan.id,
  status: plan.status,
  request: {prompt: plan.originalPrompt, city: plan.city, scheduledAt: plan.scheduledAt, budget: plan.budget, mood: plan.mood, groupType: plan.groupType},
  weather: plan.weatherSnapshot,
  weatherCheckedAt: plan.weatherCheckedAt,
  totals: {cost: plan.totalCost, durationMin: plan.totalDurationMin, distanceKm: plan.totalDistanceKm},
  explanation: {
    summary: `${plan.steps.length} étape(s) pour ${plan.totalCost} DT estimés, sur un budget de ${plan.budget} DT.`,
    assumptions: interpretationNotes(plan),
    travelNote: 'Trajets estimés à partir des distances à vol d’oiseau, sans trafic en temps réel.',
  },
  steps: plan.steps.map((step: any) => ({
    id: step.id, position: step.position, placeId: step.placeId, experienceId: step.experienceId,
    placeName: step.placeNameSnapshot, title: step.titleSnapshot, startsAt: step.startsAt, endsAt: step.endsAt,
    estimatedCost: step.estimatedCost, travelMinutes: step.travelMinutes, travelDistanceKm: step.travelDistanceKm,
    travelMode: step.travelMode, weatherFallback: step.weatherFallback, image: step.place.image, address: step.place.address,
    latitude: step.place.latitude, longitude: step.place.longitude,
    menuSelection: step.menuSelection ?? null,
    reason: `${step.estimatedCost === 0 ? 'Étape gratuite' : `${step.estimatedCost} DT estimés`} ; ${step.travelMinutes} min de trajet estimé entre les étapes.`,
  })),
});

async function createPlan(ownerId: number, prompt: string, parsed: ParsedOuting, latitude: number, longitude: number, weather: Weather, excluded = new Set<number>(), radii = searchRadii(parsed.city)) {
  const candidates = await loadCandidates(latitude, longitude, parsed.scheduledAt, parsed.participants);
  const result = buildLocalItinerary(parsed, weather, candidates, excluded, radii);
  return prisma.barmejliPlan.create({
    data: {
      userId: ownerId, originalPrompt: prompt, city: parsed.city, scheduledAt: parsed.scheduledAt, budget: parsed.budget,
      mood: parsed.mood, groupType: parsed.groupType, latitude, longitude, weatherSnapshot: weather as unknown as Prisma.InputJsonValue,
      weatherCheckedAt: new Date(), totalCost: result.totalCost, totalDurationMin: result.totalDurationMin, totalDistanceKm: result.totalDistanceKm,
      steps: {create: result.steps.map(step => ({
        placeId: step.placeId, experienceId: step.experienceId, position: step.position, startsAt: step.startsAt, endsAt: step.endsAt,
        estimatedCost: step.price, travelMinutes: step.travelMinutes, travelDistanceKm: step.travelDistanceKm, travelMode: step.travelMode,
        placeNameSnapshot: step.name, titleSnapshot: step.title,
        menuSelection: step.menuSelection ? step.menuSelection as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
      }))},
    },
    include: planInclude,
  });
}

barmejliRouter.post('/generate', route(async (req: AuthRequest, res) => {
  const body = requestSchema.parse(req.body);
  const extracted = parseOutingPrompt(body.prompt);
  const parsed = {...extracted, scheduledAt: body.scheduledAt ?? extracted.scheduledAt, budget: body.budget ?? extracted.budget, mood: body.mood ?? extracted.mood, groupType: body.groupType ?? extracted.groupType};
  const location = await resolveLocation(parsed, body.latitude, body.longitude);
  const weather = await getForecast(location.latitude, location.longitude, parsed.scheduledAt);
  const plan = await createPlan(userId(req), body.prompt, parsed, location.latitude, location.longitude, weather, undefined, searchRadii(parsed.city, body.latitude !== undefined));
  return res.status(201).json(planDto(plan));
}));

barmejliRouter.get('/', route(async (req: AuthRequest, res) => {
  const plans = await prisma.barmejliPlan.findMany({where: {userId: userId(req), status: 'SAVED'}, include: planInclude, orderBy: {scheduledAt: 'asc'}});
  return res.json(plans.map(planDto));
}));

barmejliRouter.get('/:planId', route(async (req: AuthRequest, res) => {
  const plan = await prisma.barmejliPlan.findFirst({where: {id: positiveId(req.params.planId), userId: userId(req)}, include: planInclude});
  if (!plan) return res.status(404).json({message: 'Programme introuvable'});
  return res.json(planDto(plan));
}));

barmejliRouter.patch('/:planId/save', route(async (req: AuthRequest, res) => {
  const result = await prisma.barmejliPlan.updateMany({where: {id: positiveId(req.params.planId), userId: userId(req)}, data: {status: 'SAVED'}});
  if (!result.count) return res.status(404).json({message: 'Programme introuvable'});
  return res.json({saved: true});
}));

barmejliRouter.post('/:planId/regenerate', route(async (req: AuthRequest, res) => {
  const previous = await prisma.barmejliPlan.findFirst({where: {id: positiveId(req.params.planId), userId: userId(req)}, include: {steps: true}});
  if (!previous) return res.status(404).json({message: 'Programme introuvable'});
  const parsed = {...parseOutingPrompt(previous.originalPrompt), city: previous.city, scheduledAt: previous.scheduledAt, budget: previous.budget, mood: previous.mood, groupType: previous.groupType};
  const weather = await getForecast(previous.latitude, previous.longitude, previous.scheduledAt);
  const plan = await createPlan(userId(req), previous.originalPrompt, parsed, previous.latitude, previous.longitude, weather, new Set(previous.steps.map(step => step.placeId)));
  return res.status(201).json(planDto(plan));
}));

barmejliRouter.post('/:planId/steps/:position/replace', route(async (req: AuthRequest, res) => {
  const planId = positiveId(req.params.planId);
  const position = z.coerce.number().int().min(0).parse(req.params.position);
  const plan = await prisma.barmejliPlan.findFirst({where: {id: planId, userId: userId(req)}, include: planInclude});
  if (!plan) return res.status(404).json({message: 'Programme introuvable'});
  const current = plan.steps.find(step => step.position === position);
  if (!current) return res.status(404).json({message: 'Étape introuvable'});
  const candidates = await loadCandidates(plan.latitude, plan.longitude, plan.scheduledAt, parseOutingPrompt(plan.originalPrompt).participants);
  const currentCategory = categoryName(current.experience?.category ?? current.place.category.name);
  const excluded = new Set(plan.steps.map(step => step.placeId));
  const weather = plan.weatherSnapshot as unknown as Weather;
  const otherCost = plan.steps.filter(step => step.id !== current.id).reduce((sum, step) => sum + step.estimatedCost, 0);
  const parsed = {...parseOutingPrompt(plan.originalPrompt), scheduledAt: plan.scheduledAt, budget: plan.budget, mood: plan.mood, groupType: plan.groupType};
  const ordered = plan.steps.map(step => {
    const item = candidates.find(candidate => candidate.placeId === step.placeId && (candidate.experienceId ?? null) === step.experienceId && (menuSelectionKey(candidate.menuSelection) === menuSelectionKey(step.menuSelection)));
    return item ? {...item, price: step.estimatedCost, title: step.titleSnapshot} : undefined;
  });
  const options = candidates.filter(item => !excluded.has(item.placeId) && item.category === currentCategory && item.price + otherCost <= plan.budget)
    .sort((a, b) => Math.round((a.originDistanceKm ?? 0) / LOCAL_RADIUS_KM) - Math.round((b.originDistanceKm ?? 0) / LOCAL_RADIUS_KM) || a.price - b.price);
  let result: ReturnType<typeof rebuildItinerary>;
  for (const option of options) {
    const trial = ordered.map((item, index) => plan.steps[index]!.id === current.id ? option : item);
    if (trial.some(item => item == null)) continue;
    result = rebuildItinerary(parsed, weather, trial as Candidate[]);
    if (result) break;
  }
  if (!result) return res.status(422).json({message: 'Aucune alternative ne respecte le budget, les trajets et les horaires de toutes les étapes.'});
  const rebuilt = result;
  const refreshed = await prisma.$transaction(async tx => {
    for (const [index, step] of rebuilt.steps.entries()) {
      await tx.barmejliStep.update({where: {id: plan.steps[index]!.id}, data: {
        placeId: step.placeId, experienceId: step.experienceId ?? null, estimatedCost: step.price,
        placeNameSnapshot: step.name, titleSnapshot: step.title, startsAt: step.startsAt, endsAt: step.endsAt,
        travelMinutes: step.travelMinutes, travelDistanceKm: step.travelDistanceKm, travelMode: step.travelMode,
      }});
    }
    return tx.barmejliPlan.update({where: {id: planId}, data: {totalCost: rebuilt.totalCost, totalDurationMin: rebuilt.totalDurationMin, totalDistanceKm: rebuilt.totalDistanceKm}, include: planInclude});
  });
  return res.json(planDto(refreshed));
}));

barmejliRouter.post('/:planId/adapt-weather', route(async (req: AuthRequest, res) => {
  const previous = await prisma.barmejliPlan.findFirst({where: {id: positiveId(req.params.planId), userId: userId(req)}, include: {steps: true}});
  if (!previous) return res.status(404).json({message: 'Programme introuvable'});
  const before = previous.weatherSnapshot as unknown as Weather;
  const after = await getForecast(previous.latitude, previous.longitude, previous.scheduledAt);
  if (!weatherChanged(before, after)) return res.json({changed: false, planId: previous.id, weather: after});
  const parsed = {...parseOutingPrompt(previous.originalPrompt), city: previous.city, scheduledAt: previous.scheduledAt, budget: previous.budget, mood: previous.mood, groupType: previous.groupType};
  const plan = await createPlan(userId(req), previous.originalPrompt, parsed, previous.latitude, previous.longitude, after);
  return res.status(201).json({changed: true, plan: planDto(plan)});
}));
