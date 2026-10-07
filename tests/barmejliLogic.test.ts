import {describe, expect, it} from 'vitest';
import {buildItinerary, buildLocalItinerary, cityCenter, haversineKm, rebuildItinerary, Candidate, isCoherent, outingTemplate, parseOutingPrompt, roleFor, Weather, weatherCompatible} from '../src/barmejliLogic';

const fair: Weather = {observedAt: '2026-09-05T18:00:00Z', temperatureC: 25, precipitationProbability: 5, precipitationMm: 0, windKph: 10, weatherCode: 0, summary: 'Ciel dégagé', adverse: false};
const rainy: Weather = {...fair, precipitationProbability: 85, precipitationMm: 3, summary: 'Pluie prévue', adverse: true};
const hours = [{weekday: 6, openTime: '08:00', closeTime: '23:59', isClosed: false}];
const candidate = (overrides: Partial<Candidate>): Candidate => ({
  placeId: 1, name: 'Adresse réelle', title: 'Une expérience', category: 'cafe', latitude: 36.87, longitude: 10.33,
  price: 20, durationMin: 60, moods: ['romantique'], groupTypes: ['couple'], environment: 'INDOOR', weatherSensitive: false,
  openingHours: hours, closureDates: [], ...overrides,
});

describe('Barmejli request understanding', () => {
  it('asks for a total budget rather than guessing per-person prices', () => {
    expect(() => parseOutingPrompt('Sortie en couple 50 DT par personne')).toThrow('budget total');
  });
  it('does not read a budget as a start time and uses whole hours correctly', () => {
    expect(parseOutingPrompt('Sortie à Tunis budget 120 DT à 19h').scheduledAt.getHours()).toBe(19);
    expect(parseOutingPrompt('Sortie à Tunis budget 120 DT à 19h').scheduledAt.getMinutes()).toBe(0);
    expect(() => parseOutingPrompt('Sortie à Tunis à 25h budget 20 DT')).toThrow('horaire valide');
  });

  it('understands walking, exclusions, affordable budgets and time limits', () => {
    const result = parseOutingPrompt('Sortie à Tunis à 19h jusqu’à 22h, petit budget, à pied, sans restaurant');
    expect(result.budget).toBe(30);
    expect(result.city).toBe('Tunis');
    expect(result.walkingOnly).toBe(true);
    expect(result.excludedCategories).toContain('restaurant');
    expect(result.maxDurationMin).toBe(180);
  });

  it('recognizes Arabic digits and basic Tunisian preferences', () => {
    const result = parseOutingPrompt('نحب sortie هادي في تونس مع صحابي ٣٠ دينار');
    expect(result.budget).toBe(30);
    expect(result.city).toBe('Tunis');
    expect(result.mood).toBe('calme');
    expect(result.groupType).toBe('amis');
  });
  it('extracts a French natural-language outing request', () => {
    const parsed = parseOutingPrompt('Sortie romantique à La Marsa samedi soir, budget 120 DT', new Date('2026-09-01T10:00:00+02:00'));
    expect(parsed.city).toBe('La Marsa');
    expect(parsed.budget).toBe(120);
    expect(parsed.mood).toBe('romantique');
    expect(parsed.groupType).toBe('couple');
    expect(parsed.scheduledAt.getDay()).toBe(6);
    expect(parsed.scheduledAt.getHours()).toBe(18);
  });
});

describe('Barmejli weather constraints', () => {
  it('rejects a weather-sensitive outdoor activity in rain', () => {
    expect(weatherCompatible(candidate({environment: 'OUTDOOR', weatherSensitive: true}), rainy)).toBe(false);
  });

  it('keeps indoor and covered activities available in rain', () => {
    expect(weatherCompatible(candidate({environment: 'INDOOR'}), rainy)).toBe(true);
    expect(weatherCompatible(candidate({environment: 'COVERED_OUTDOOR', weatherSensitive: true}), rainy)).toBe(true);
  });
});

describe('Barmejli itinerary generation', () => {
  it('recalculates travel and all following schedules when a stop changes', () => {
    const input = parseOutingPrompt('Sortie samedi à 18h budget 100 DT pendant 3 heures');
    const first = candidate({placeId: 1, durationMin: 30});
    const second = candidate({placeId: 2, category: 'activity', latitude: 36.89, durationMin: 30});
    const result = rebuildItinerary(input, fair, [first, second]);
    expect(result?.steps[1]?.travelMinutes).toBeGreaterThan(0);
    expect(result?.steps[1]?.startsAt.getTime()).toBeGreaterThan(result!.steps[0]!.endsAt.getTime());
    expect(result?.totalCost).toBe(40);
    expect(rebuildItinerary({...input, maxDurationMin: 60}, fair, [first, second])).toBeUndefined();
    expect(rebuildItinerary({...input, budget: 20}, fair, [first, second])).toBeUndefined();
  });
  it('compares complete programmes instead of spending the budget on the first choice', () => {
    const input = parseOutingPrompt('Sortie romantique samedi soir 30 DT');
    const result = buildItinerary(input, fair, [
      candidate({placeId: 1, price: 25, moods: ['romantique']}),
      candidate({placeId: 2, price: 5, moods: []}),
      candidate({placeId: 3, category: 'activity', price: 10}),
      candidate({placeId: 4, category: 'restaurant', price: 15}),
    ]);
    // Le soir en amoureux : activité, puis dîner, puis un verre ou un dessert.
    expect(result.steps.map(step => step.placeId)).toEqual([3, 4, 2]);
    expect(result.totalCost).toBe(30);
  });

  it('enforces exclusions and never suggests driving for a walking-only outing', () => {
    const input = parseOutingPrompt('Sortie à pied sans restaurant samedi 100 DT');
    const result = buildItinerary(input, fair, [
      candidate({placeId: 1}),
      candidate({placeId: 2, category: 'activity', latitude: 37.2}),
      candidate({placeId: 3, category: 'restaurant', price: 0}),
      candidate({placeId: 4, category: 'activity', latitude: 36.88}),
    ]);
    expect(result.steps.some(step => step.placeId === 2 || step.placeId === 3)).toBe(false);
    expect(result.steps.every(step => step.travelMode === 'walk')).toBe(true);
  });

  it('rejects invalid durations and finds a new programme without repeating excluded places', () => {
    const input = parseOutingPrompt('Sortie samedi 30 DT');
    const result = buildItinerary(input, fair, [candidate({placeId: 1}), candidate({placeId: 2}), candidate({placeId: 3, durationMin: Number.NaN})], new Set([1]));
    expect(result.steps.map(step => step.placeId)).toEqual([2]);
  });
  it('respects the express duration including travel time', () => {
    const input = parseOutingPrompt('J’ai 30 DT et 2 heures pour une sortie à Tunis.');
    expect(input.maxDurationMin).toBe(120);
    const result = buildItinerary(input, fair, [candidate({price: 10}), candidate({placeId: 2, category: 'activity', price: 5}), candidate({placeId: 3, category: 'restaurant', price: 10})]);
    expect(result.totalDurationMin).toBeLessThanOrEqual(120);
    expect(result.totalCost).toBeLessThanOrEqual(30);
  });
  it('combines a paid café with a free outdoor activity within 20 DT', () => {
    const input = parseOutingPrompt('Sortie samedi soir 20 DT');
    const result = buildItinerary(input, fair, [candidate({price: 18}), candidate({placeId: 2, category: 'activity', price: 0, environment: 'OUTDOOR', weatherSensitive: true})]);
    expect(result.steps).toHaveLength(2);
    expect(result.totalCost).toBe(18);
  });

  it('recognizes free-only requests and rejects unknown prices', () => {
    const input = parseOutingPrompt('Sortie gratuite samedi soir à La Marsa');
    expect(input.budget).toBe(0);
    expect(parseOutingPrompt('Sortie samedi soir 0dt').budget).toBe(0);
    const result = buildItinerary(input, fair, [candidate({price: 18}), candidate({placeId: 2, category: 'activity', price: 0}), candidate({placeId: 3, price: Number.NaN})]);
    expect(result.totalCost).toBe(0);
    expect(result.steps.map(step => step.placeId)).toEqual([2]);
  });

  it('does not propose a free weather-sensitive walk in rain', () => {
    const input = parseOutingPrompt('Sortie gratuite samedi soir');
    expect(() => buildItinerary(input, rainy, [candidate({price: 0, category: 'activity', environment: 'OUTDOOR', weatherSensitive: true})])).toThrow();
  });

  it('accepts 20dt without a space and returns a single affordable stop', () => {
    const input = parseOutingPrompt('Sortie romantique à La Marsa samedi soir, budget 20dt', new Date('2026-09-01T10:00:00+02:00'));
    expect(input.budget).toBe(20);
    const result = buildItinerary(input, fair, [candidate({price: 18}), candidate({placeId: 2, category: 'activity', price: 25})]);
    expect(result.steps).toHaveLength(1);
    expect(result.totalCost).toBe(18);
  });

  it('explains an impossible budget without returning an over-budget plan', () => {
    const input = parseOutingPrompt('La Marsa samedi soir budget 20dt');
    expect(() => buildItinerary(input, fair, [candidate({price: 25})])).toThrow('budget de 20 DT');
  });

  it('builds a chronological plan within budget with travel totals', () => {
    const input = parseOutingPrompt('Sortie romantique à La Marsa samedi soir 120 DT', new Date('2026-09-01T10:00:00+02:00'));
    const candidates = [
      candidate({placeId: 1, name: 'North Shore Coffee', category: 'cafe', price: 15}),
      candidate({placeId: 2, name: 'Agora', category: 'activity', price: 25, latitude: 36.875}),
      candidate({placeId: 3, name: 'The Cliff', category: 'restaurant', price: 65, latitude: 36.88}),
      candidate({placeId: 4, name: 'Blue Café', category: 'cafe', price: 12, latitude: 36.882}),
    ];
    const result = buildItinerary(input, fair, candidates);
    // Un seul café, et le dîner au centre de la soirée.
    expect(result.steps.map(step => step.category)).toEqual(['activity', 'restaurant', 'cafe']);
    expect(result.steps[1]!.name).toBe('The Cliff');
    expect(result.steps[1]!.startsAt.getHours()).toBeGreaterThanOrEqual(19);
    expect(result.totalCost).toBeLessThanOrEqual(120);
    expect(result.steps.every((step, index) => index === 0 || step.startsAt >= result.steps[index - 1]!.endsAt)).toBe(true);
    expect(result.totalDistanceKm).toBeGreaterThan(0);
  });

  it('uses indoor alternatives when the weather is adverse', () => {
    const input = parseOutingPrompt('Sortie en couple à La Marsa samedi soir 100 DT', new Date('2026-09-01T10:00:00+02:00'));
    const result = buildItinerary(input, rainy, [
      candidate({placeId: 1, category: 'cafe'}),
      candidate({placeId: 2, category: 'activity', environment: 'OUTDOOR', weatherSensitive: true}),
      candidate({placeId: 3, name: 'Agora', category: 'activity', environment: 'INDOOR'}),
      candidate({placeId: 4, category: 'restaurant', price: 40}),
    ]);
    expect(result.steps.some(step => step.placeId === 2)).toBe(false);
    expect(result.steps.some(step => step.name === 'Agora')).toBe(true);
  });
});

describe('Barmejli coherent programmes', () => {
  const evening = () => parseOutingPrompt('Sortie romantique à La Marsa samedi soir, budget 120 DT', new Date('2026-09-01T10:00:00+02:00'));
  const marsa = [
    candidate({placeId: 1, name: 'North Shore Coffee', category: 'cafe', title: 'Coffee shop moderne', price: 18}),
    candidate({placeId: 2, name: '[Démo] Pause au bord de mer', category: 'activity', title: 'Pause au bord de mer', price: 0, environment: 'OUTDOOR', weatherSensitive: true, latitude: 36.875}),
    candidate({placeId: 3, name: 'Bambalouni & Co', category: 'restaurant', title: 'Street food tunisienne', price: 55, latitude: 36.878}),
    candidate({placeId: 4, name: 'Blue Café', category: 'cafe', title: 'Terrasse à Sidi Bou Saïd', price: 18, latitude: 36.871}),
    candidate({placeId: 5, name: 'The Cliff', category: 'restaurant', title: 'Restaurant avec vue sur mer', price: 55, latitude: 36.869}),
    candidate({placeId: 6, name: 'Gourmandise', category: 'cafe', title: 'Pâtisserie et salon de thé', price: 15, latitude: 36.879}),
  ];

  it('never schedules two cafés in the same outing', () => {
    const result = buildItinerary(evening(), fair, marsa);
    const roles = result.steps.map(step => step.role ?? roleFor(step.category, step.title));
    expect(roles.filter(role => role === 'drink').length).toBeLessThanOrEqual(1);
    expect(roles.filter(role => role === 'meal')).toHaveLength(1);
  });

  it('builds a romantic evening around a dinner, not street food, and serves dessert after it', () => {
    const result = buildItinerary(evening(), fair, marsa);
    const dinner = result.steps.find(step => step.category === 'restaurant')!;
    expect(dinner.name).toBe('The Cliff');
    expect(dinner.startsAt.getHours()).toBeGreaterThanOrEqual(19);
    const dessertIndex = result.steps.findIndex(step => step.placeId === 6);
    if (dessertIndex !== -1) expect(dessertIndex).toBeGreaterThan(result.steps.indexOf(dinner));
    expect(result.totalCost).toBeLessThanOrEqual(120);
  });

  it('rejects incoherent sequences', () => {
    const cafe = candidate({placeId: 1, category: 'cafe'});
    const otherCafe = candidate({placeId: 2, category: 'cafe'});
    const dinner = candidate({placeId: 3, category: 'restaurant'});
    const dessert = candidate({placeId: 4, category: 'cafe', title: 'Pâtisserie'});
    expect(isCoherent([cafe, otherCafe])).toBe(false);
    expect(isCoherent([dessert, dinner])).toBe(false);
    expect(isCoherent([cafe, dinner, dessert])).toBe(true);
  });

  it('starts lunch at lunchtime and keeps brunch for the morning', () => {
    const lunch = parseOutingPrompt('Sortie samedi midi à Tunis 80 DT');
    expect(outingTemplate(lunch)[0]!.roles).toEqual(['meal']);
    const morning = parseOutingPrompt('Brunch samedi matin à Tunis 60 DT');
    expect(outingTemplate(morning)[0]!.roles).toEqual(['drink']);
  });
});

describe('Barmejli zone et nombre d’étapes', () => {
  const now = new Date('2026-09-01T10:00:00+02:00');
  const ariana = cityCenter('Ariana')!;
  const at = (c: Candidate) => ({...c, originDistanceKm: haversineKm(ariana, c)});
  // Sidi Bou Saïd : très « romantique » mais à ~13 km d'Ariana.
  const pool = [
    candidate({placeId: 10, name: 'Balade Sidi Bou Saïd', category: 'activity', title: 'Balade avec vue sur mer', price: 0, environment: 'OUTDOOR', latitude: 36.8687, longitude: 10.3417}),
    candidate({placeId: 11, name: 'Café des Délices', category: 'cafe', title: 'Terrasse avec vue', price: 15, latitude: 36.8695, longitude: 10.3425}),
    candidate({placeId: 12, name: 'Jardin d’Ariana', category: 'activity', title: 'Promenade au parc', price: 0, environment: 'OUTDOOR', latitude: 36.865, longitude: 10.19}),
    candidate({placeId: 13, name: 'Dar Ariana', category: 'restaurant', title: 'Restaurant méditerranéen terrasse', price: 70, latitude: 36.86, longitude: 10.2}),
    candidate({placeId: 14, name: 'Salon Ennasr', category: 'cafe', title: 'Pâtisserie et salon de thé', price: 20, latitude: 36.857, longitude: 10.164}),
  ].map(at);

  it('reste à Ariana quand la ville a assez d’adresses', () => {
    const input = parseOutingPrompt('Sortie romantique à ariana samedi soir, budget 120 DT', now);
    const result = buildLocalItinerary(input, fair, pool);
    expect(result.radiusKm).toBe(5);
    expect(result.steps.every(step => step.originDistanceKm! <= 5)).toBe(true);
    expect(result.steps.map(step => step.placeId)).not.toContain(10);
  });

  it('respecte « sur deux étapes »', () => {
    const input = parseOutingPrompt('Sortie romantique à ariana samedi soir, budget 120 DT sur deux etape', now);
    expect(input.stepCount).toBe(2);
    const result = buildLocalItinerary(input, fair, pool);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.some(step => step.category === 'restaurant')).toBe(true);
  });

  it('comprend « 3 étapes » et « une seule étape »', () => {
    expect(parseOutingPrompt('Sortie à Tunis samedi, 3 étapes, budget 50 DT', now).stepCount).toBe(3);
    expect(parseOutingPrompt('Sortie à Tunis samedi, une seule étape, budget 50 DT', now).stepCount).toBe(1);
    expect(parseOutingPrompt('Sortie à Tunis samedi pour 2 personnes, budget 50 DT', now).stepCount).toBeUndefined();
  });

  it('élargit la zone seulement si la ville manque d’adresses', () => {
    const input = parseOutingPrompt('Sortie romantique à ariana samedi soir, budget 120 DT', now);
    const result = buildLocalItinerary(input, fair, pool.filter(item => item.placeId < 12));
    expect(result.radiusKm).toBe(25);
  });
});
