export const interestCatalog = [
  {key: 'restaurant', label: 'Restaurants'},
  {key: 'cafe', label: 'Cafés'},
  {key: 'brunch', label: 'Brunch'},
  {key: 'fast_food', label: 'Fast-food'},
  {key: 'pastry', label: 'Pâtisserie'},
  {key: 'sport', label: 'Sport'},
  {key: 'gaming', label: 'Gaming'},
  {key: 'cinema', label: 'Cinéma'},
  {key: 'leisure', label: 'Loisirs'},
  {key: 'culture', label: 'Culture'},
  {key: 'walks', label: 'Balades'},
  {key: 'nightlife', label: 'Vie nocturne'},
  {key: 'guesthouse', label: 'Maisons d’hôtes'},
] as const;

export const interestKeys = new Set<string>(interestCatalog.map(item => item.key));
