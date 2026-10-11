import {describe, expect, it} from 'vitest';
import {derjaToFrench} from '../src/derja';
import {parseOutingPrompt} from '../src/barmejliLogic';

const now = new Date('2026-10-07T10:00:00+01:00');

describe('Barmejli comprend la derja', () => {
  it('arabizi : ville, moment, groupe, ambiance et budget', () => {
    const r = parseOutingPrompt('Nheb resto hedi fil Marsa ghodwa fil lil m3a s7abi, 80 dinar', now);
    expect(r.city.toLowerCase()).toContain('marsa');
    expect(r.budget).toBe(80);
    expect(r.mood).toBe('calme');
    expect(r.groupType).toBe('amis');
    expect(r.preferredCategories).toContain('restaurant');
    expect(r.scheduledAt.getDate()).toBe(8);
    expect(r.scheduledAt.getHours()).toBeGreaterThanOrEqual(18);
  });

  it('écriture arabe : couple, jour, ville et dîner', () => {
    const r = parseOutingPrompt('نحب نتعشى مع مرتي في قمرت السبت الليل 150 د', now);
    expect(r.city).toBe('Gammarth');
    expect(r.budget).toBe(150);
    expect(r.groupType).toBe('couple');
    expect(r.scheduledAt.getDay()).toBe(6);
    expect(r.preferredCategories).toContain('restaurant');
  });

  it('famille, matin, pas cher et nombre d’adresses', () => {
    const family = parseOutingPrompt('ftour fil sbe7 m3a l3ayla fil lac, 90 dt', now);
    expect(family).toMatchObject({groupType: 'famille', budget: 90});
    expect(family.city.toLowerCase()).toBe('lac');
    expect(family.scheduledAt.getHours()).toBeLessThan(12);
    expect(parseOutingPrompt('9ahwa rkhisa fi tounes', now)).toMatchObject({city: 'Tunis', budget: 30, preferredCategories: ['cafe']});
    expect(parseOutingPrompt('cafe hedi fil menzah, zouz blayes', now).stepCount).toBe(2);
    const single = parseOutingPrompt('blasa barka, resto fil 7ammamet, 60 alf', now);
    expect(single).toMatchObject({stepCount: 1, city: 'Hammamet', budget: 60});
    expect(single.groupType).not.toBe('solo');
  });

  it('ne touche pas aux mots ordinaires', () => {
    expect(derjaToFrench('Avenue Hédi Nouira, Ariana')).toBe('Avenue Hédi Nouira, Ariana');
    expect(derjaToFrench('Le chat du café, file d’attente')).toBe('Le chat du café, file d’attente');
  });
});
