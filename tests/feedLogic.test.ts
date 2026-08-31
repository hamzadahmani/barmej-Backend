import {describe, expect, it} from 'vitest';
import {campaignEligible, isOpenAt, scoreCandidate} from '../src/feedLogic';

describe('feed scoring', () => {
  it('prioritizes learned interests for an established user', () => {
    const base = {proximity: .5, engagement: .4, freshness: .5, quality: .8, popularity: .4, availability: 1, novelty: 1, seenPenalty: 0};
    expect(scoreCandidate({...base, interest: 1}, false)).toBeGreaterThan(scoreCandidate({...base, interest: 0}, false));
  });

  it('uses proximity and quality during cold start', () => {
    const base = {interest: 0, engagement: .4, freshness: .5, popularity: .4, availability: 1, novelty: 1, seenPenalty: 0};
    expect(scoreCandidate({...base, proximity: 1, quality: 1}, true)).toBeGreaterThan(scoreCandidate({...base, proximity: 0, quality: .5}, true));
  });

  it('penalizes recently seen videos', () => {
    const signals = {interest: 1, proximity: 1, engagement: 1, freshness: 1, quality: 1, popularity: 1, availability: 1, novelty: 1};
    expect(scoreCandidate({...signals, seenPenalty: 1}, false)).toBeLessThan(scoreCandidate({...signals, seenPenalty: 0}, false));
  });
});

describe('intelligent filtering helpers', () => {
  it('handles regular, overnight and closed schedules', () => {
    expect(isOpenAt('09:00', '23:00', false, '12:00')).toBe(true);
    expect(isOpenAt('18:00', '02:00', false, '01:00')).toBe(true);
    expect(isOpenAt('09:00', '23:00', true, '12:00')).toBe(false);
  });
});

describe('sponsored campaigns', () => {
  const campaign = {userImpressions: 0, maxUserImpressions: 2, dailyImpressions: 10, totalImpressions: 100, bidCpmCents: 800, dailyBudgetCents: 3000, totalBudgetCents: 50000, distanceKm: 5, radiusKm: 40};
  it('accepts an eligible campaign', () => expect(campaignEligible(campaign)).toBe(true));
  it('enforces frequency, radius and budget caps', () => {
    expect(campaignEligible({...campaign, userImpressions: 2})).toBe(false);
    expect(campaignEligible({...campaign, distanceKm: 50})).toBe(false);
    expect(campaignEligible({...campaign, dailyImpressions: 4000})).toBe(false);
  });
});
