import {describe, expect, it} from 'vitest';
import {distanceKm, placeInterests, recommendationScore, reviewSummary} from '../src/discoveryLogic';

describe('Explorer recommendations', () => {
  it('matches the shared interests with accents and avoids substring matches', () => {
    expect(placeInterests({name: 'Café des Arts', ambienceTags: ['Brunch']})).toEqual(['cafe', 'brunch']);
    expect(placeInterests({name: 'Barbecue', ambienceTags: []})).not.toContain('nightlife');
    expect(placeInterests({name: 'Salle', ambienceTags: [], media: [{keywords: ['gaming', 'sport', 'cinéma']}]})).toEqual(['sport', 'gaming', 'cinema']);
  });
  it('does not invent reviews when absent or disabled', () => {
    const reviews = [{cuisineRating: 5, serviceRating: 4, ambianceRating: 4, priceRating: 3}];
    expect(reviewSummary(true, reviews)).toEqual({rating: 4, reviewCount: 1});
    expect(reviewSummary(false, reviews)).toEqual({rating: null, reviewCount: 0});
    expect(reviewSummary(true, [])).toEqual({rating: null, reviewCount: 0});
  });
  it('uses interests, budget, favorites, history and optional proximity', () => {
    const place = {id: 1, interests: ['gaming'], averagePrice: 20, ambienceTags: ['Calme'], rating: 4, distance: null};
    const user = {interests: ['gaming'], preferredBudget: 30, favoriteAmbiences: ['Calme']};
    const score = recommendationScore(place, user, new Set());
    expect(score).toBeGreaterThan(recommendationScore({...place, interests: [], averagePrice: null, ambienceTags: []}, user, new Set()));
    expect(recommendationScore(place, user, new Set([1]))).toBeGreaterThan(score);
    expect(recommendationScore({...place, distance: 1}, user, new Set())).toBeGreaterThan(score);
  });
  it('handles identical and zero coordinates without NaN', () => {
    expect(distanceKm({latitude: 0, longitude: 0}, {latitude: 0, longitude: 0})).toBe(0);
    expect(distanceKm({latitude: 0, longitude: 0}, {latitude: 0, longitude: 1})).toBeCloseTo(111.19, 1);
  });
});
