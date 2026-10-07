import {interestCatalog} from './interests';

export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const terms: Record<string, string[]> = {
  restaurant: ['restaurant', 'cuisine', 'diner'], cafe: ['cafe', 'coffee'], brunch: ['brunch'],
  fast_food: ['fast food', 'fast-food', 'burger', 'pizza'], pastry: ['patisserie', 'pastry', 'dessert'],
  sport: ['sport', 'fitness', 'padel', 'football'], gaming: ['gaming', 'jeu', 'game'],
  cinema: ['cinema', 'film'], leisure: ['loisir', 'activite'], culture: ['culture', 'art', 'musee'],
  walks: ['balade', 'walk', 'parc', 'randonnee'], nightlife: ['nightlife', 'vie nocturne', 'bar', 'club', 'soiree'],
  guesthouse: ['guesthouse', 'maison d hotes', 'maisons d hotes', 'chambre d hotes', 'gite'],
};
export function placeInterests(place: {name: string; subtitle?: string | null; description?: string | null; cuisineType?: string | null; ambienceTags: string[]; category?: {name: string}; media?: Array<{keywords: string[]}>}) {
  const words = normalize([place.name, place.subtitle, place.description, place.cuisineType, place.category?.name, ...place.ambienceTags, ...(place.media ?? []).flatMap(media => media.keywords)].join(' ')).split(/[^a-z0-9]+/).filter(Boolean).join(' ');
  return interestCatalog.filter(item => [item.key, item.label, ...(terms[item.key] ?? [])].some(term => (` ${words} `).includes(` ${normalize(term).replace(/[_-]/g, ' ')} `))).map(item => item.key);
}
export function reviewSummary(enabled: boolean, reviews: Array<{cuisineRating: number; serviceRating: number; ambianceRating: number; priceRating: number}>) {
  const valid = enabled ? reviews.filter(review => Object.values(review).every(value => Number.isFinite(value) && value >= 1 && value <= 5)) : [];
  return {reviewCount: valid.length, rating: valid.length ? Math.round(valid.reduce((sum, review) => sum + (review.cuisineRating + review.serviceRating + review.ambianceRating + review.priceRating) / 4, 0) / valid.length * 10) / 10 : null};
}
export function distanceKm(a: {latitude: number; longitude: number}, b: {latitude: number; longitude: number}) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function recommendationScore(place: {id: number; interests: string[]; averagePrice: number | null; ambienceTags: string[]; rating: number | null; distance: number | null}, preferences: {interests: string[]; preferredBudget: number | null; favoriteAmbiences: string[]}, affinity: Set<number>) {
  return place.interests.filter(key => preferences.interests.includes(key)).length * 8
    + place.ambienceTags.filter(tag => preferences.favoriteAmbiences.some(value => normalize(value) === normalize(tag))).length * 3
    + (preferences.preferredBudget != null && place.averagePrice != null && place.averagePrice <= preferences.preferredBudget ? 4 : 0)
    + (affinity.has(place.id) ? 3 : 0) + (place.rating ?? 0) / 5
    + (place.distance == null ? 0 : 3 / (1 + place.distance));
}
