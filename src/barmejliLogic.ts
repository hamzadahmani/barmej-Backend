import type {MenuSelection} from './menuLogic';
export type ParsedOuting = {
  city: string;
  scheduledAt: Date;
  budget: number;
  mood: string;
  groupType: string;
  maxDurationMin?: number;
  walkingOnly?: boolean;
  excludedCategories?: string[];
  preferredCategories?: string[];
  assumptions?: string[];
  participants?: number;
  /** Nombre d'étapes demandé explicitement (« sur deux étapes »). */
  stepCount?: number;
};

export type Weather = {
  observedAt: string;
  temperatureC: number;
  precipitationProbability: number;
  precipitationMm: number;
  windKph: number;
  weatherCode: number;
  summary: string;
  adverse: boolean;
};

// Rôle d'une étape dans une sortie : c'est lui qui rend un programme logique
// (un seul repas, une seule boisson, le dessert après le repas…).
export type Role = 'meal' | 'drink' | 'dessert' | 'activity';

export type Candidate = {
  placeId: number;
  role?: Role;
  /** Texte descriptif (sous-titre, cuisine, mots-clés) utilisé pour les préférences d'ambiance. */
  style?: string;
  experienceId?: number;
  menuSelection?: MenuSelection;
  name: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  originDistanceKm?: number;
  price: number;
  durationMin: number;
  moods: string[];
  groupTypes: string[];
  environment: 'INDOOR' | 'OUTDOOR' | 'COVERED_OUTDOOR' | 'MIXED';
  weatherSensitive: boolean;
  minTemperatureC?: number | null;
  maxTemperatureC?: number | null;
  maxWindKph?: number | null;
  openingHours: Array<{weekday: number; openTime: string | null; closeTime: string | null; isClosed: boolean}>;
  closureDates: string[];
};

export type ItineraryStep = Candidate & {
  position: number;
  startsAt: Date;
  endsAt: Date;
  travelMinutes: number;
  travelDistanceKm: number;
  travelMode: 'walk' | 'drive';
};

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nextWeekday = (now: Date, weekday: number) => {
  const result = new Date(now);
  const add = (weekday - now.getDay() + 7) % 7 || 7;
  result.setDate(result.getDate() + add);
  return result;
};

/** Déduit le rôle d'un lieu à partir de sa catégorie et de sa description. */
export function roleFor(category: string, description = ''): Role {
  const text = normalize(`${category} ${description}`);
  if (/patisserie|glacier|glace|dessert|gourmandise|salon de the|crepe|gaufre/.test(text)) return 'dessert';
  if (category === 'restaurant' || /restaurant|street food|cuisine|bistro|grill|pizz|burger|snack|diner|dejeuner/.test(text)) return 'meal';
  if (category === 'cafe' || /\bcafe\b|coffee|the\b|brunch|bar\b|cocktail|rooftop|lounge|jus/.test(text)) return 'drink';
  return 'activity';
}
const roleOf = (item: Candidate): Role => item.role ?? roleFor(item.category, `${item.title} ${item.style ?? ''}`);
const describe = (item: Candidate) => normalize(`${item.name} ${item.title} ${item.style ?? ''}`);

type Slot = {roles: Role[]; anchor?: boolean; prefer?: RegExp; avoid?: RegExp};
const MAX_PER_ROLE: Record<Role, number> = {meal: 1, drink: 1, dessert: 1, activity: 2};

/**
 * Modèle de sortie selon le moment et l'ambiance. Le moteur ne combine plus des
 * catégories au hasard : il remplit ces cases dans l'ordre, chacune pouvant être sautée.
 */
export function outingTemplate(input: ParsedOuting): Slot[] {
  const hour = input.scheduledAt.getHours();
  const mood = normalize(input.mood);
  const after = {roles: ['dessert', 'drink'] as Role[]};
  if (hour < 11) return [
    {roles: ['drink'], prefer: /brunch|petit[- ]dejeuner|jus/},
    {roles: ['activity'], prefer: /balade|promenade|musee|plage|mer/},
    {roles: ['activity']},
  ];
  if (hour < 15) return [
    {roles: ['meal'], anchor: true},
    {roles: ['activity'], prefer: /balade|promenade|musee|plage|mer|cinema/},
    after,
  ];
  if (hour < 17) return [
    {roles: ['activity'], prefer: /balade|promenade|musee|plage|mer|cinema/},
    {roles: ['dessert', 'drink'], prefer: /patisserie|the\b|terrasse|vue/},
    {roles: ['activity']},
  ];
  if (mood === 'romantique') return [
    {roles: ['activity'], prefer: /balade|promenade|coucher|mer|plage|vue|cinema/},
    {roles: ['meal'], anchor: true, prefer: /vue|mer|terrasse|raffin|gastronom|mediterran|francaise|patio/, avoid: /street food|fast|snack|burger/},
    {roles: ['dessert', 'drink'], prefer: /terrasse|vue|the\b|patisserie|rooftop|cocktail|lounge/},
  ];
  if (mood === 'festif') return [
    {roles: ['meal'], anchor: true},
    {roles: ['drink'], prefer: /bar|cocktail|rooftop|live|lounge/},
    {roles: ['activity'], prefer: /club|live|musique|soiree|spectacle/},
  ];
  if (mood === 'calme') return [
    {roles: ['activity'], prefer: /balade|promenade|musee|cinema|mer/},
    {roles: ['meal'], anchor: true},
    {roles: ['dessert', 'drink'], prefer: /the\b|patisserie|calme|terrasse/},
  ];
  return [{roles: ['activity']}, {roles: ['meal'], anchor: true}, after];
}

/** Créneau d'un repas : le dîner commence entre 19h et 22h30, le déjeuner entre 12h et 14h30. */
function mealWindow(input: ParsedOuting, arrival: Date): {notBefore: Date; notAfter: Date} | undefined {
  const hour = input.scheduledAt.getHours();
  const at = (h: number, m = 0) => { const d = new Date(arrival); d.setHours(h, m, 0, 0); return d; };
  if (hour >= 17) return {notBefore: at(19), notAfter: at(22, 30)};
  if (hour >= 11 && hour < 15) return {notBefore: at(12), notAfter: at(14, 30)};
  return undefined;
}
const MAX_WAIT_MIN = 75;

/** Règles de cohérence d'un programme complet. */
export function isCoherent(steps: Candidate[]) {
  const roles = steps.map(roleOf);
  const counts = {meal: 0, drink: 0, dessert: 0, activity: 0} as Record<Role, number>;
  for (const [index, role] of roles.entries()) {
    if (index > 0 && roles[index - 1] === role) return false;
    if (++counts[role] > MAX_PER_ROLE[role]) return false;
  }
  const meal = roles.indexOf('meal'), dessert = roles.indexOf('dessert');
  return meal === -1 || dessert === -1 || dessert > meal;
}

export function parseOutingPrompt(prompt: string, now = new Date()): ParsedOuting {
  const text = normalize(prompt).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const budgetMatch = text.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:dt|tnd|dinars?\b|دينار|دنانير)/i)
    ?? text.match(/\bbudget\s*(?:de|:)?\s*(\d{1,5}(?:[.,]\d{1,2})?)/);
  const freeOnly = /\b(?:gratuit|gratuite|gratuites|gratuits)\b|sans depenser|sans budget/.test(text);
  const budget = freeOnly || /بلاش|مجاني/.test(text) ? 0 : budgetMatch ? Number(budgetMatch[1]!.replace(',', '.')) : /pas cher|petit budget|رخيص/.test(text) ? 30 : 100;
  const cityMatch = prompt.match(/(?:^|\s)(?:a|à|au|fi)\s+([\p{L}' -]{2,40}?)(?=\s+(?:ce|cet|cette|demain|aujourd|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|budget|avec|pour|soir|matin|midi|vers|a\s+\d|à\s+\d|pendant|sans)|[,.;]|$)/iu);
  const knownCity = text.match(KNOWN_CITY_PATTERN)?.[0];
  const stepWords: Record<string, number> = {un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, 'زوز': 2};
  const stepMatch = text.match(/(\d|une?|deux|trois|quatre|cinq|زوز)\s+(?:seule?s?\s+)?(?:etapes?|endroits?|lieux|adresses?|arrets?|stops?|بلايص|محطات)/);
  const stepCount = stepMatch ? Math.min(5, Math.max(1, stepWords[stepMatch[1]!] ?? Number(stepMatch[1]))) : undefined;
  const city = cityMatch?.[1]?.trim() || knownCity || (/المرسى/.test(text) ? 'La Marsa' : /تونس/.test(text) ? 'Tunis' : 'Grand Tunis');
  const weekdays: Record<string, number> = {dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6};
  let scheduledAt = new Date(now);
  const day = Object.entries(weekdays).find(([label]) => text.includes(label));
  if (/demain/.test(text)) scheduledAt.setDate(scheduledAt.getDate() + 1);
  else if (day) scheduledAt = nextWeekday(now, day[1]);
  const explicitTime = text.match(/\b(?:a|vers|de|des)\s+(\d{1,2})(?:[:h](\d{2})?)?(?=\s|[,.;]|$)/);
  const hour = explicitTime ? Number(explicitTime[1]) : /matin/.test(text) ? 10 : /midi|dejeuner/.test(text) ? 12 : /apres-midi/.test(text) ? 15 : 18;
  if (hour > 23 || Number(explicitTime?.[2] ?? 0) > 59) throw Object.assign(new Error('Indiquez un horaire valide, par exemple 19h30.'), {statusCode: 400});
  scheduledAt.setHours(hour, explicitTime ? Number(explicitTime[2] ?? 0) : 30, 0, 0);
  const mood = /romanti|couple|en amoureux|date\b/.test(text) ? 'romantique' : /festif|fete|danser|party/.test(text) ? 'festif' : /calme|chill|detente|هادي|هادئ/.test(text) ? 'calme' : /famill|عائلة/.test(text) ? 'familial' : 'decouverte';
  const groupType = /famill|enfant|عائلة/.test(text) ? 'famille' : /amis|copains|groupe|صحابي/.test(text) ? 'amis' : /solo|seul|وحدي/.test(text) ? 'solo' : /romanti|couple|amoureux|date\b/.test(text) ? 'couple' : 'amis';
  const perPerson = /par personne|chacun|\/\s*personne/.test(text);
  const peopleMatch = text.match(/\b(\d{1,2})\s*(?:personnes?|amis|adultes?)\b/);
  const people = peopleMatch ? Number(peopleMatch[1]) : groupType === 'couple' ? 2 : groupType === 'solo' ? 1 : undefined;
  if (perPerson) throw Object.assign(new Error('Précisez un budget total pour la sortie : les tarifs des lieux ne permettent pas encore de calculer un total fiable par personne.'), {statusCode: 400});
  if (!Number.isInteger(budget)) throw Object.assign(new Error('Indiquez votre budget total en dinars entiers.'), {statusCode: 400});
  if (budget > 10_000 || (peopleMatch && (!people || people > 50))) throw Object.assign(new Error('Précisez un budget total inférieur à 10 000 DT et un groupe de 1 à 50 personnes.'), {statusCode: 400});
  const durationMatch = text.match(/\b(\d{1,2})\s*heures?\b|\b(?:pendant|pour|duree)\s+(\d{1,2})h\b/);
  const minuteMatch = text.match(/\b(\d{1,3})\s*(?:minutes?|min)\b/);
  let maxDurationMin = durationMatch ? Math.min(12, Math.max(1, Number(durationMatch[1] ?? durationMatch[2]))) * 60 : minuteMatch ? Math.max(1, Math.min(720, Number(minuteMatch[1]))) : undefined;
  const until = text.match(/\b(?:jusqu'a|jusqu’a|jusqua)\s*(\d{1,2})(?:[:h](\d{2})?)?/);
  if (until) {
    const endHour = Number(until[1]), endMinute = Number(until[2] ?? 0);
    if (endHour > 23 || endMinute > 59) throw Object.assign(new Error('Indiquez un horaire de fin valide.'), {statusCode: 400});
    const span = (endHour * 60 + endMinute - scheduledAt.getHours() * 60 - scheduledAt.getMinutes() + 1440) % 1440;
    if (!span || span > 720) throw Object.assign(new Error('Précisez une durée de sortie entre 1 minute et 12 heures.'), {statusCode: 400});
    maxDurationMin = maxDurationMin == null ? span : Math.min(maxDurationMin, span);
  }
  const walkingOnly = /a pied|sans voiture|walk|مشي/.test(text);
  const categories = [{key: 'restaurant', terms: 'restaurant|resto|diner|dejeuner'}, {key: 'cafe', terms: 'cafe|brunch'}, {key: 'activity', terms: 'activite|balade|musee|cinema|bowling'}];
  const excludedCategories = categories.filter(item => new RegExp(`(?:sans|pas de|eviter|ni)\\s+(?:les?\\s+|de\\s+)?(?:${item.terms})\\b`).test(text)).map(item => item.key);
  const preferredCategories = categories.filter(item => !excludedCategories.includes(item.key) && new RegExp(`\\b(?:${item.terms})\\b`).test(text)).sort((a, b) => text.search(new RegExp(a.terms)) - text.search(new RegExp(b.terms))).map(item => item.key);
  const assumptions = [!budgetMatch && !freeOnly && !/بلاش|مجاني/.test(text) ? `Budget interprété : ${budget} DT pour le programme.` : '', city === 'Grand Tunis' && !cityMatch && !knownCity ? 'Zone par défaut : Grand Tunis.' : '', !explicitTime ? 'Horaire estimé à partir du moment de la journée.' : ''].filter(Boolean);
  return {city, scheduledAt, budget, mood, groupType, maxDurationMin, walkingOnly, excludedCategories, preferredCategories, assumptions, participants: people ?? 1, stepCount};
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function isOpenFor(candidate: Candidate, startsAt: Date, durationMin: number) {
  const date = startsAt.toISOString().slice(0, 10);
  if (candidate.closureDates.includes(date)) return false;
  const hours = candidate.openingHours.find(item => item.weekday === startsAt.getDay());
  if (!hours) return true;
  if (hours.isClosed || !hours.openTime || !hours.closeTime) return false;
  const start = startsAt.getHours() * 60 + startsAt.getMinutes();
  let open = minutes(hours.openTime);
  let close = minutes(hours.closeTime);
  if (close <= open) close += 24 * 60;
  const adjustedStart = start < open && close > 24 * 60 ? start + 24 * 60 : start;
  return adjustedStart >= open && adjustedStart + durationMin <= close;
}

export function weatherCompatible(candidate: Candidate, weather: Weather) {
  if (candidate.minTemperatureC != null && weather.temperatureC < candidate.minTemperatureC) return false;
  if (candidate.maxTemperatureC != null && weather.temperatureC > candidate.maxTemperatureC) return false;
  if (candidate.maxWindKph != null && weather.windKph > candidate.maxWindKph) return false;
  if (!weather.adverse) return true;
  if (candidate.environment === 'INDOOR' || candidate.environment === 'COVERED_OUTDOOR') return true;
  return !candidate.weatherSensitive && candidate.environment === 'MIXED';
}

export function haversineKm(a: Pick<Candidate, 'latitude' | 'longitude'>, b: Pick<Candidate, 'latitude' | 'longitude'>) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

type Point = {latitude: number; longitude: number};

// Centres approximatifs des villes et quartiers : une demande « à Ariana »
// doit partir d'Ariana, pas de la première adresse dont le texte contient « ariana ».
const CITY_CENTERS: Record<string, Point> = {
  'grand tunis': {latitude: 36.8065, longitude: 10.1815},
  tunis: {latitude: 36.8008, longitude: 10.18},
  'centre ville': {latitude: 36.8008, longitude: 10.18},
  ariana: {latitude: 36.8625, longitude: 10.1956},
  ennasr: {latitude: 36.857, longitude: 10.164},
  'cite ennasr': {latitude: 36.857, longitude: 10.164},
  'la soukra': {latitude: 36.874, longitude: 10.24},
  soukra: {latitude: 36.874, longitude: 10.24},
  menzah: {latitude: 36.84, longitude: 10.17},
  'el menzah': {latitude: 36.84, longitude: 10.17},
  manar: {latitude: 36.842, longitude: 10.158},
  'el manar': {latitude: 36.842, longitude: 10.158},
  'lac': {latitude: 36.838, longitude: 10.233},
  'le lac': {latitude: 36.838, longitude: 10.233},
  'berges du lac': {latitude: 36.838, longitude: 10.233},
  'les berges du lac': {latitude: 36.838, longitude: 10.233},
  'la marsa': {latitude: 36.878, longitude: 10.325},
  marsa: {latitude: 36.878, longitude: 10.325},
  'sidi bou said': {latitude: 36.8687, longitude: 10.3417},
  carthage: {latitude: 36.8528, longitude: 10.3233},
  gammarth: {latitude: 36.918, longitude: 10.288},
  'la goulette': {latitude: 36.818, longitude: 10.305},
  goulette: {latitude: 36.818, longitude: 10.305},
  bardo: {latitude: 36.809, longitude: 10.134},
  'le bardo': {latitude: 36.809, longitude: 10.134},
  'ben arous': {latitude: 36.753, longitude: 10.228},
  manouba: {latitude: 36.81, longitude: 10.097},
  hammamet: {latitude: 36.4, longitude: 10.6167},
  nabeul: {latitude: 36.4561, longitude: 10.7376},
  sousse: {latitude: 35.8256, longitude: 10.6084},
  monastir: {latitude: 35.7643, longitude: 10.8113},
  mahdia: {latitude: 35.5047, longitude: 11.0622},
  sfax: {latitude: 34.7406, longitude: 10.7603},
  bizerte: {latitude: 37.2744, longitude: 9.8739},
  kairouan: {latitude: 35.6781, longitude: 10.0963},
  djerba: {latitude: 33.8076, longitude: 10.8451},
  tabarka: {latitude: 36.9544, longitude: 8.758},
};
export const cityKey = (city: string) => normalize(city).replace(/['’-]/g, ' ').replace(/\s+/g, ' ').trim();
export const cityCenter = (city: string): Point | undefined => CITY_CENTERS[cityKey(city)];
const KNOWN_CITY_PATTERN = new RegExp(`\\b(?:${Object.keys(CITY_CENTERS).sort((a, b) => b.length - a.length).join('|')})\\b`);

/** Rayons essayés (km) : on reste dans la ville demandée et on n'élargit que si elle manque d'adresses. */
export const LOCAL_RADIUS_KM = 5;
export function searchRadii(city: string, explicitPoint = false) {
  return !explicitPoint && cityKey(city) === 'grand tunis' ? [25] : [LOCAL_RADIUS_KM, 10, 25];
}

/**
 * Construit le programme le plus local possible : d'abord dans la ville,
 * puis dans un rayon élargi seulement si la ville ne permet pas au moins deux étapes.
 */
export function buildLocalItinerary(input: ParsedOuting, weather: Weather, candidates: Candidate[], excludedPlaceIds = new Set<number>(), radii = searchRadii(input.city)) {
  let fallback: (ReturnType<typeof buildItinerary> & {radiusKm: number}) | undefined;
  let lastError: unknown;
  for (const [index, radiusKm] of radii.entries()) {
    const local = candidates.filter(item => (item.originDistanceKm ?? 0) <= radiusKm);
    if (!local.length) continue;
    try {
      const result = buildItinerary(input, weather, local, excludedPlaceIds);
      if (result.steps.length >= Math.min(2, input.stepCount ?? 2) || index === radii.length - 1) {
        return fallback && fallback.steps.length >= result.steps.length ? fallback : {...result, radiusKm};
      }
      fallback ??= {...result, radiusKm};
    } catch (error) {
      lastError = error;
    }
  }
  if (fallback) return fallback;
  throw lastError ?? Object.assign(new Error(`Aucune adresse disponible près de ${input.city} pour ce budget de ${input.budget} DT, à ces horaires et à la météo. Essayez un autre horaire, une autre ville ou ajustez votre budget.`), {statusCode: 422});
}

const itemCount = (selection?: MenuSelection) => selection ? Math.min(selection.items.length - 1, 1) * 0.4 : 0;

function appendStep(input: ParsedOuting, steps: ItineraryStep[], item: Candidate): ItineraryStep | undefined {
  const previous = steps.at(-1);
  const distance = previous ? haversineKm(previous, item) : item.originDistanceKm ?? 0;
  if (!Number.isFinite(distance) || !Number.isFinite(item.durationMin) || item.durationMin <= 0) return;
  // Straight-line distances are estimates, not road routing or traffic data.
  if (input.walkingOnly && distance > 3) return;
  const travelMode = input.walkingOnly || distance <= 1.2 ? 'walk' as const : 'drive' as const;
  const travelMinutes = previous ? Math.max(3, Math.ceil(distance / (travelMode === 'walk' ? 4.5 : 25) * 60)) : 0;
  let startsAt = new Date((previous?.endsAt ?? input.scheduledAt).getTime() + travelMinutes * 60_000);
  if (roleOf(item) === 'meal') {
    // Pas de dîner à 18h : on attend l'heure du repas (au plus 75 min), jamais au-delà du créneau.
    const window = mealWindow(input, startsAt);
    if (window) {
      if (startsAt < window.notBefore) {
        if (window.notBefore.getTime() - startsAt.getTime() > MAX_WAIT_MIN * 60_000) return;
        startsAt = window.notBefore;
      }
      if (startsAt > window.notAfter) return;
    }
  }
  const endsAt = new Date(startsAt.getTime() + item.durationMin * 60_000);
  if (endsAt.getTime() > input.scheduledAt.getTime() + (input.maxDurationMin ?? 360) * 60_000) return;
  if (!isOpenFor(item, startsAt, item.durationMin)) return;
  return {...item, position: steps.length, startsAt, endsAt, travelMinutes, travelDistanceKm: previous ? distance : 0, travelMode};
}

export function rebuildItinerary(input: ParsedOuting, weather: Weather, ordered: Candidate[]) {
  const steps: ItineraryStep[] = [];
  let totalCost = 0;
  for (const candidate of ordered) {
    if (!Number.isFinite(candidate.price) || candidate.price < 0 || input.excludedCategories?.includes(candidate.category) || !weatherCompatible(candidate, weather) || steps.some(step => step.placeId === candidate.placeId)) return;
    const step = appendStep(input, steps, candidate);
    if (!step || totalCost + candidate.price > input.budget) return;
    steps.push(step);
    totalCost += candidate.price;
  }
  if (!steps.length || !isCoherent(steps)) return;
  return {steps, totalCost: Math.round(totalCost * 100) / 100, totalDurationMin: Math.round((steps.at(-1)!.endsAt.getTime() - input.scheduledAt.getTime()) / 60_000), totalDistanceKm: Math.round(steps.reduce((sum, step) => sum + step.travelDistanceKm, 0) * 10) / 10};
}

export function buildItinerary(input: ParsedOuting, weather: Weather, candidates: Candidate[], excludedPlaceIds = new Set<number>()) {
  const eligible = candidates.filter(item => Number.isFinite(item.price) && item.price >= 0 && !excludedPlaceIds.has(item.placeId) && !input.excludedCategories?.includes(item.category) && weatherCompatible(item, weather));
  const slots = outingTemplate(input);
  // Une catégorie demandée explicitement (« dîner », « brunch »…) doit trouver sa place.
  for (const category of input.preferredCategories ?? []) {
    const role = roleFor(category);
    if (!slots.some(slot => slot.roles.includes(role))) slots.push({roles: [role]});
  }
  const anchored = slots.some(slot => slot.anchor);
  type State = {steps: ItineraryStep[]; cost: number; score: number};
  let states: State[] = [{steps: [], cost: 0, score: 0}];
  for (const slot of slots) {
    const alternatives: State[] = [...states]; // Chaque case peut être sautée (fermé, trop cher, trop loin).
    for (const state of states) {
      if (input.stepCount && state.steps.length >= input.stepCount) continue;
      const options = eligible.filter(item => !state.steps.some(step => step.placeId === item.placeId) && slot.roles.includes(roleOf(item)) && state.cost + item.price <= input.budget && isCoherent([...state.steps, item]))
        .map(item => appendStep(input, state.steps, item)).filter((step): step is ItineraryStep => step !== undefined)
        .map(step => {
          const text = describe(step);
          const mood = step.moods.map(normalize).includes(normalize(input.mood)) ? 2 : 0;
          const group = step.groupTypes.map(normalize).includes(normalize(input.groupType)) ? 1 : 0;
          const preference = input.preferredCategories?.includes(step.category) ? 4 : 0;
          const ambience = (slot.prefer?.test(text) ? 2 : 0) - (slot.avoid?.test(text) ? 4 : 0);
          const menuVariety = itemCount(step.menuSelection);
          const previousEnd = state.steps.at(-1)?.endsAt ?? input.scheduledAt;
          const waitMin = Math.max(0, (step.startsAt.getTime() - previousEnd.getTime()) / 60_000 - step.travelMinutes);
          const score = 8 + mood + group + preference + ambience + menuVariety + (slot.anchor ? 3 : 0) - step.travelDistanceKm / 5 - (step.originDistanceKm ?? 0) / 4 - step.price / Math.max(input.budget, 1) - waitMin / 30;
          return {steps: [...state.steps, step], cost: state.cost + step.price, score: state.score + score};
        }).sort((a, b) => b.score - a.score || a.cost - b.cost).slice(0, 12);
      alternatives.push(...options);
    }
    states = alternatives.sort((a, b) => b.score - a.score || a.cost - b.cost).slice(0, 48);
  }
  // Une sortie du soir ou du midi sans repas n'est retenue que si aucun repas n'est possible.
  // Le nombre d'étapes demandé prime : un programme plus court n'est retenu que faute de mieux.
  const stepPenalty = (state: State) => input.stepCount && state.steps.length !== input.stepCount ? 20 * Math.abs(input.stepCount - state.steps.length) : 0;
  const finalScore = (state: State) => state.score - stepPenalty(state) - (anchored && !state.steps.some(step => roleOf(step) === 'meal') ? 6 : 0);
  states.sort((a, b) => finalScore(b) - finalScore(a) || a.cost - b.cost);
  const selected = states[0]!.steps;
  if (!selected.length) throw Object.assign(new Error('Aucune adresse disponible ne correspond à votre budget de ' + input.budget + ' DT, à ces horaires et à la météo. Essayez un autre horaire, une autre ville ou ajustez votre budget.'), {statusCode: 422});
  return {
    steps: selected,
    totalCost: Math.round(selected.reduce((sum, step) => sum + step.price, 0) * 100) / 100,
    totalDurationMin: Math.round((selected.at(-1)!.endsAt.getTime() - input.scheduledAt.getTime()) / 60_000),
    totalDistanceKm: Math.round(selected.reduce((sum, step) => sum + step.travelDistanceKm, 0) * 10) / 10,
  };
}
