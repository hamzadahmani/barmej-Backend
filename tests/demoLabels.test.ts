import {describe, expect, it} from 'vitest';
import {stripDemoLabels} from '../src/demoLabels';

describe('demo labels', () => {
  it('hides demo markers from names, subtitles and addresses', () => {
    expect(stripDemoLabels('[Démo] Pause au bord de mer')).toBe('Pause au bord de mer');
    expect(stripDemoLabels('Saint Tropez — Démo')).toBe('Saint Tropez');
    expect(stripDemoLabels('La Marsa / Sidi Bou Saïd — lieu de démonstration')).toBe('La Marsa / Sidi Bou Saïd');
    expect(stripDemoLabels('Balade gratuite · Démonstration')).toBe('Balade gratuite');
  });
  it('walks nested responses and leaves other text untouched', () => {
    const body = {steps: [{placeName: '[Démo] Balade à Sidi Bou Saïd', cost: 0}], user: {lastName: 'Démo'}, url: 'barmej/demo/le-patio', at: '2026-10-05T18:30:00.000Z'};
    expect(stripDemoLabels(body)).toEqual({steps: [{placeName: 'Balade à Sidi Bou Saïd', cost: 0}], user: {lastName: 'Démo'}, url: 'barmej/demo/le-patio', at: '2026-10-05T18:30:00.000Z'});
  });
});
