import {describe, expect, it} from 'vitest';
import {menuOptions, parseMenuText, priceToMillimes} from '../src/menuLogic';
import {buildItinerary, Candidate, parseOutingPrompt, Weather} from '../src/barmejliLogic';

describe('Photo menu interpretation and validation', () => {
  it('keeps prices in exact millimes instead of floating-point dinars', () => {
    expect(priceToMillimes('12,500')).toBe(12500);
    expect(priceToMillimes('0')).toBe(0);
    expect(priceToMillimes('3.075')).toBe(3075);
    expect(priceToMillimes('12.5000')).toBeUndefined();
    expect(priceToMillimes('-5')).toBeUndefined();
  });
  it('extracts clear lines and refuses ambiguous multi-price lines', () => {
    const items = parseMenuText('Café espresso .... 3,500 DT\nPizza 12 / 18 DT\nTél 12345678\nJus orange ٥ دينار\nPlat du jour 18.500 DT');
    expect(items.map(item => item.priceMillimes)).toEqual([3500, 5000, 18500]);
    expect(items[0]?.kind).toBe('DRINK');
    expect(items[2]?.kind).toBe('OTHER'); // A human must classify the dish.
  });
  it('never uses drafts, expired menus or unavailable dishes', () => {
    const at = new Date('2026-10-01T12:00:00Z');
    const items = [{name: 'Plat', priceMillimes: 18000, kind: 'MAIN', available: true}, {name: 'Eau', priceMillimes: 2500, kind: 'DRINK', available: false}];
    expect(menuOptions('restaurant', [{id: 1, items, active: false, validatedAt: at}], at)).toEqual([]);
    expect(menuOptions('restaurant', [{id: 1, items, active: true, validatedAt: new Date('2026-01-01')}], at)).toEqual([]);
    const options = menuOptions('restaurant', [{id: 1, items, active: true, validatedAt: at}], at, 2);
    expect(options).toHaveLength(1);
    expect(options[0]?.totalMillimes).toBe(36000);
    expect(options[0]?.items[0]?.quantity).toBe(2);
  });
  it('fits a validated meal in the outing budget without rounding down prices', () => {
    const at = new Date();
    const selection = menuOptions('restaurant', [{id: 1, active: true, validatedAt: at, items: [{name: 'Plat', kind: 'MAIN', priceMillimes: 19500, available: true}]}], at)[0]!;
    const candidate: Candidate = {placeId: 1, name: 'Restaurant réel', title: 'Plat', category: 'restaurant', latitude: 36.8, longitude: 10.18, price: Math.ceil(selection.totalMillimes / 1000), durationMin: 60, moods: [], groupTypes: [], environment: 'INDOOR', weatherSensitive: false, openingHours: [], closureDates: [], menuSelection: selection};
    const weather = {adverse: false} as Weather;
    expect(buildItinerary(parseOutingPrompt('Sortie à Tunis 20 DT'), weather, [candidate]).totalCost).toBe(20);
    expect(() => buildItinerary(parseOutingPrompt('Sortie à Tunis 19 DT'), weather, [candidate])).toThrow('budget de 19 DT');
  });
});
