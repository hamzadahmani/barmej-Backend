import {describe, expect, it} from 'vitest';
import {buildAvailableFilters, matchesFeedKeyword} from '../src/feed';

const keywords = ['Petit-déjeuner', 'Brunch', 'Espace calme'];

describe('feed keyword filters', () => {
  it('matches an existing keyword regardless of accents and case', () => {
    expect(matchesFeedKeyword(keywords, 'PETIT-DEJEUNER')).toBe(true);
  });

  it('only matches complete manager-defined keywords', () => {
    expect(matchesFeedKeyword(keywords, 'calme')).toBe(false);
  });

  it('rejects unrelated content', () => {
    expect(matchesFeedKeyword(keywords, 'pizza')).toBe(false);
  });

  it('builds filters only from keywords used by published videos', () => {
    expect(buildAvailableFilters([{keywords}, {keywords: ['Brunch', 'Terrasse']}])).toEqual([
      {keyword: 'Brunch', count: 2},
      {keyword: 'Espace calme', count: 1},
      {keyword: 'Petit-déjeuner', count: 1},
      {keyword: 'Terrasse', count: 1},
    ]);
  });
});
