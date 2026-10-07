import {VenueEnvironment} from '@prisma/client';

/**
 * Lieux réels du Grand Tunis, relevés à partir de sources publiques (octobre 2026).
 *
 * À SAVOIR AVANT LA MISE EN LIGNE
 * - Noms, adresses et téléphones viennent des sources citées (champ `source`) ;
 *   ils peuvent avoir changé depuis.
 * - Coordonnées GPS : approximatives (niveau rue ou quartier). À corriger avec le lieu.
 * - averagePrice : prix moyen ESTIMÉ par personne, sauf quand la source donne un tarif
 *   (musées, escape games). Barmejli l'utilise comme une estimation.
 * - Horaires : renseignés seulement quand une source les donne ; sinon aucun horaire
 *   n'est créé (le moteur ne confirme alors pas l'ouverture).
 * - Photos : images d'illustration génériques, PAS des photos du lieu. À remplacer par
 *   les photos fournies par l'établissement.
 * - verified = false partout : aucun de ces lieux n'est encore partenaire.
 */

const image = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
const photo = {
  tunisian: image('photo-1550966871-3ed3cdb5ed0c'),
  restaurant: image('photo-1517248135467-4c7edcad34c4'),
  seafood: image('photo-1544148103-0773bf10d330'),
  street: image('photo-1565299507177-b0ac66763828'),
  cafe: image('photo-1501339847302-ac426a4a7cbb'),
  terrace: image('photo-1554118811-1e0d58224f24'),
  pastry: image('photo-1578985545062-69928b1d9587'),
  bar: image('photo-1514933651103-005eec06c04b'),
  cinema: image('photo-1489599849927-2ee91cede3ba'),
  escape: image('photo-1511512578047-dfb367046420'),
  culture: image('photo-1519167758481-83f550bb49b3'),
  stay: image('photo-1566073771259-6a8506099945'),
};

export type RealPlace = {
  name: string;
  /** Ancien nom de la fiche de démonstration remplacée par ce lieu réel. */
  replaces?: string;
  /** 1 restaurants · 2 cafés · 3 sorties · 4 maisons d'hôtes */
  categoryId: 1 | 2 | 3 | 4;
  subtitle: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  /** Prix moyen par personne (null pour les maisons d'hôtes : le tarif est par nuit, voir subtitle). */
  averagePrice: number | null;
  /** days : horaires différents pour certains jours (0 = dimanche … 6 = samedi). */
  /** Maisons d'hôtes : prix d'une nuit « à partir de » (DT) et nombre de chambres connues. */
  nightlyPrice?: number;
  roomCount?: number;
  hours?: {open: string; close: string; closedDays?: number[]; days?: Partial<Record<number, {open: string; close: string}>>};
  description: string;
  keywords: string[];
  moods: string[];
  groups: string[];
  environment: VenueEnvironment;
  weatherSensitive?: boolean;
  durationMin: number;
  image: string;
  source: string;
};

const ALL = ['couple', 'amis', 'famille', 'solo'];
const {INDOOR, MIXED, OUTDOOR} = VenueEnvironment;

const S = {
  cultureTrip: 'https://theculturetrip.com/articles/where-to-eat-well-in-tunis-10-restaurants',
  wtg: 'https://www.worldtravelguide.net/guides/africa/tunisia/tunis/restaurants/',
  wvTunis: 'https://en.wikivoyage.org/wiki/Tunis',
  wvSidi: 'https://en.wikivoyage.org/wiki/Sidi_Bou_Said',
  lonely: 'https://www.lonelyplanet.com/tunisia/tunis/nightlife',
  goulette: 'https://www.webdo.tn/fr/actualite/chroniques/pour-tous-les-budgets-que-diriez-vous-dune-viree-poissons-a-la-goulette/188010/',
  pastry: 'https://www.marhba.com/lifestyle/quelles-sont-les-meilleures-patisseries-de-tunis',
  ice: 'https://www.marhba.com/lifestyle/ou-manger-de-tres-bonnes-glaces-a-tunis',
  paradice: 'https://www.paradice.tn/nos-boutiques',
  museums: 'https://www.webdo.tn/fr/actualite/culture/musees-et-sites-archeologiques-nouvelle-grille-tarifaire-des-ce-1er-avril/395596/',
  dirStays: 'https://maisonsdhotestunisie.com/maisons-hotes/',
};

export const realPlaces: RealPlace[] = [
  // ───────────── Restaurants · Médina et centre-ville ─────────────
  {name: 'Dar Slah', categoryId: 1, subtitle: 'Cuisine tunisienne traditionnelle', address: '145 rue de la Kasbah, Médina, Tunis', latitude: 36.7990, longitude: 10.1683, averagePrice: 45, description: 'Cuisine tunisienne dans une demeure de la médina vieille d’environ quatre siècles.', keywords: ['restaurant', 'culture'], moods: ['romantique', 'calme', 'decouverte', 'familial'], groups: ALL, environment: INDOOR, durationMin: 90, image: photo.tunisian, source: S.cultureTrip},
  {name: 'Fondouk El Attarine', categoryId: 1, subtitle: 'Cuisine tunisienne, patio de la médina', address: '9 bis souk El Attarine, Médina, Tunis', latitude: 36.7978, longitude: 10.1707, averagePrice: 50, description: 'Ancien fondouk du souk des parfumeurs : patio lumineux, cuisine tunisienne et musique traditionnelle.', keywords: ['restaurant', 'culture'], moods: ['romantique', 'decouverte', 'familial'], groups: ALL, environment: INDOOR, durationMin: 90, image: photo.tunisian, source: S.cultureTrip},
  {name: 'El Ali', categoryId: 1, subtitle: 'Restaurant, café littéraire et terrasse sur la médina', address: '45 bis rue Jemaâ Zitouna, Médina, Tunis', latitude: 36.7983, longitude: 10.1718, averagePrice: 35, description: 'Cuisine tunisienne dans une cour couverte, café littéraire et toit-terrasse avec vue sur la médina.', keywords: ['restaurant', 'cafe', 'culture'], moods: ['calme', 'decouverte', 'romantique'], groups: ALL, environment: MIXED, durationMin: 90, image: photo.tunisian, source: S.cultureTrip},
  {name: 'Essaraya', categoryId: 1, subtitle: 'Cuisine tunisienne dans un palais restauré', address: '6 rue Ben Mahmoud, Bab Menara, Médina, Tunis', latitude: 36.7947, longitude: 10.1666, averagePrice: 60, description: 'Palais restauré de la médina avec alcôves privées ; classiques tunisiens comme la marka h’loua et le kabkabou.', keywords: ['restaurant', 'culture'], moods: ['romantique', 'decouverte', 'familial'], groups: ALL, environment: INDOOR, durationMin: 100, image: photo.tunisian, source: S.cultureTrip},
  {name: 'Dar Belhadj', categoryId: 1, subtitle: 'Cuisine méditerranéenne en médina', address: '17 rue des Tamis, Médina, Tunis', latitude: 36.7962, longitude: 10.1698, phone: '+216 71 200 894', averagePrice: 40, description: 'Cuisine méditerranéenne et tunisienne dans une maison de la médina.', keywords: ['restaurant', 'culture'], moods: ['romantique', 'decouverte', 'familial'], groups: ALL, environment: INDOOR, durationMin: 90, image: photo.tunisian, source: S.wtg},
  {name: 'Le Malouf', categoryId: 1, subtitle: 'Restaurant italien, cour et soirées DJ', address: 'Rue de Yougoslavie, centre-ville, Tunis', latitude: 36.8015, longitude: 10.1800, phone: '+216 71 254 246', averagePrice: 40, hours: {open: '19:00', close: '23:59', closedDays: [0]}, description: 'Derrière une porte jaune, une cour au cœur du centre-ville : grande carte italienne, parfois musique live ou DJ. Aussi ouvert le midi (11h30–15h).', keywords: ['restaurant', 'nightlife'], moods: ['festif', 'decouverte', 'romantique'], groups: ['couple', 'amis'], environment: MIXED, durationMin: 90, image: photo.restaurant, source: S.wvTunis},
  {name: 'Chez Slah', categoryId: 1, subtitle: 'Poissons et fruits de mer', address: '14 bis rue Pierre de Coubertin, Le Passage, Tunis', latitude: 36.8090, longitude: 10.1772, phone: '+216 71 258 588', averagePrice: 50, description: 'Adresse historique du centre de Tunis pour les poissons et fruits de mer.', keywords: ['restaurant'], moods: ['romantique', 'decouverte', 'familial'], groups: ALL, environment: INDOOR, durationMin: 90, image: photo.seafood, source: S.wtg},
  {name: 'Restaurant Les Étoiles', categoryId: 1, subtitle: 'Couscous et cuisine populaire', address: '3 rue Mustapha M’barek, centre-ville, Tunis', latitude: 36.7990, longitude: 10.1790, averagePrice: 15, description: 'Petite adresse populaire du centre-ville : couscous, salades et plats du jour à petits prix.', keywords: ['restaurant', 'fast_food'], moods: ['decouverte', 'calme'], groups: ALL, environment: INDOOR, durationMin: 60, image: photo.street, source: S.wvTunis},

  // ───────────── Restaurants · Banlieue nord, La Goulette, Lac, Ennasr ─────────────
  {name: 'Dar Zarrouk', categoryId: 1, subtitle: 'Poisson et cuisine tunisienne revisitée, vue sur mer', address: 'Rue Hédi Zarrouk, Sidi Bou Saïd', latitude: 36.8711, longitude: 10.3443, averagePrice: 70, hours: {open: '12:30', close: '23:00'}, description: 'En haut de la falaise de Sidi Bou Saïd, vue sur le golfe : poisson frais et plats tunisiens revisités.', keywords: ['restaurant'], moods: ['romantique', 'decouverte'], groups: ['couple', 'amis', 'famille'], environment: MIXED, weatherSensitive: true, durationMin: 100, image: photo.seafood, source: S.wvSidi},
  {name: 'Au Bon Vieux Temps — Sidi Bou Saïd', categoryId: 1, subtitle: 'Poisson, grillades, cuisine tunisienne et française', address: '56 rue Hédi Zarrouk, Sidi Bou Saïd', latitude: 36.8713, longitude: 10.3450, averagePrice: 45, description: 'Sur une ruelle pavée du village : poissons, viandes, plats tunisiens et français.', keywords: ['restaurant'], moods: ['romantique', 'decouverte', 'familial'], groups: ALL, environment: MIXED, durationMin: 90, image: photo.restaurant, source: S.wvSidi},
  {name: 'Au Bon Vieux Temps — La Marsa', categoryId: 1, subtitle: 'Poisson, grillades, cuisine tunisienne et française', address: '1 rue Abou Kacem Chebbi, La Marsa', latitude: 36.8770, longitude: 10.3245, averagePrice: 45, description: 'L’adresse marsoise de la maison, près de la gare : poissons, viandes, plats tunisiens et français.', keywords: ['restaurant'], moods: ['romantique', 'decouverte', 'familial'], groups: ALL, environment: INDOOR, durationMin: 90, image: photo.restaurant, source: S.cultureTrip},
  {name: 'Le Chargui', categoryId: 1, subtitle: 'Cuisine méditerranéenne à petits prix', address: '39 rue Habib Thameur, Sidi Bou Saïd', latitude: 36.8712, longitude: 10.3430, phone: '+216 55 355 942', averagePrice: 25, description: 'Adresse simple du village pour un repas méditerranéen abordable.', keywords: ['restaurant'], moods: ['decouverte', 'calme', 'familial'], groups: ALL, environment: MIXED, durationMin: 75, image: photo.restaurant, source: S.wtg},
  {name: 'Le Rest’ô', categoryId: 1, subtitle: 'Restaurant sur la colline de Byrsa', address: 'Rue Mendès France, colline de Byrsa, Carthage', latitude: 36.8535, longitude: 10.3233, phone: '+216 71 733 433', averagePrice: 70, description: 'Restaurant haut de gamme sur la colline de Byrsa, près du site archéologique de Carthage.', keywords: ['restaurant', 'culture'], moods: ['romantique', 'decouverte'], groups: ['couple', 'amis', 'famille'], environment: MIXED, durationMin: 100, image: photo.restaurant, source: S.wtg},
  {name: 'Lucullus', categoryId: 1, subtitle: 'Poissons et fruits de mer, terrasse sur le port', address: '1 avenue Habib Bourguiba, La Goulette', latitude: 36.8186, longitude: 10.3050, phone: '+216 98 219 403', averagePrice: 80, description: 'Grande table de fruits de mer de La Goulette, avec terrasse entourée de palmiers.', keywords: ['restaurant'], moods: ['romantique', 'decouverte'], groups: ['couple', 'amis', 'famille'], environment: MIXED, durationMin: 100, image: photo.seafood, source: S.wtg},
  {name: 'El Flouka', categoryId: 1, subtitle: 'Poisson grillé au prix du marché', address: 'La Goulette', latitude: 36.8180, longitude: 10.3062, averagePrice: 40, description: 'On choisit son poisson à l’étal, vendu au prix du marché, puis grillé pour un petit supplément.', keywords: ['restaurant'], moods: ['decouverte', 'familial', 'festif'], groups: ALL, environment: MIXED, durationMin: 75, image: photo.seafood, source: S.goulette},
  {name: 'La Sirène', categoryId: 1, subtitle: 'Poisson grillé au prix du marché', address: 'La Goulette', latitude: 36.8176, longitude: 10.3058, averagePrice: 40, description: 'Formule goulettoise : poisson choisi au prix du marché, grillé pour un petit supplément.', keywords: ['restaurant'], moods: ['decouverte', 'familial', 'festif'], groups: ALL, environment: MIXED, durationMin: 75, image: photo.seafood, source: S.goulette},
  {name: 'La Bô M', categoryId: 1, subtitle: 'Cuisine de saison inventive, terrasse', address: 'Avenue principale, Les Berges du Lac, Tunis', latitude: 36.8330, longitude: 10.2330, averagePrice: 60, description: 'Cuisine de saison mêlant créativité et touches tunisiennes, terrasse ensoleillée sous des arches de marbre.', keywords: ['restaurant'], moods: ['romantique', 'decouverte'], groups: ['couple', 'amis'], environment: MIXED, durationMin: 90, image: photo.restaurant, source: S.cultureTrip},
  {name: 'La Tavolata', categoryId: 1, subtitle: 'Pizzas, pâtes et risottos', address: 'Avenue Hédi Nouira, Ennasr II, Ariana', latitude: 36.8590, longitude: 10.1600, averagePrice: 35, description: 'Italien décontracté à Ennasr : pizzas, pâtes et risottos dans un décor plein d’humour.', keywords: ['restaurant'], moods: ['festif', 'decouverte', 'familial'], groups: ALL, environment: INDOOR, durationMin: 75, image: photo.restaurant, source: S.cultureTrip},
  {name: 'Le Bambou', categoryId: 1, subtitle: 'Sushis et cuisine asiatique', address: '2 avenue Hédi Nouira, Ennasr, Ariana', latitude: 36.8580, longitude: 10.1620, phone: '+216 23 690 602', averagePrice: 40, description: 'Sushis et cuisine asiatique fusion à Ennasr.', keywords: ['restaurant'], moods: ['decouverte', 'romantique', 'festif'], groups: ALL, environment: INDOOR, durationMin: 75, image: photo.restaurant, source: S.wtg},

  // ───────────── Cafés et salons de thé ─────────────
  {name: 'Café de Paris', categoryId: 2, subtitle: 'Grande brasserie de l’avenue Bourguiba', address: 'Avenue Habib Bourguiba, Tunis', latitude: 36.7998, longitude: 10.1817, phone: '+216 71 240 583', averagePrice: 20, description: 'L’un des grands cafés de l’avenue, très animé : café, pizzas, couscous et salades.', keywords: ['cafe'], moods: ['decouverte', 'festif'], groups: ALL, environment: MIXED, durationMin: 60, image: photo.cafe, source: S.wtg},
  {name: 'Le Grand Café du Théâtre', categoryId: 2, subtitle: 'Brasserie et terrasse face au Théâtre', address: 'Avenue Habib Bourguiba, Tunis', latitude: 36.8000, longitude: 10.1831, averagePrice: 25, description: 'Terrasse abritée de grands parasols sur l’avenue Bourguiba ; snacks et plats de brasserie.', keywords: ['cafe'], moods: ['decouverte', 'calme'], groups: ALL, environment: MIXED, durationMin: 60, image: photo.terrace, source: S.cultureTrip},
  {name: 'Café Saf-Saf', replaces: 'Café Saf-Saf — Démo', categoryId: 2, subtitle: 'Café traditionnel et cour carrelée', address: 'Rue El Mekki, La Marsa', latitude: 36.8789, longitude: 10.3257, averagePrice: 10, description: 'Le café traditionnel le plus célèbre de La Marsa, avec sa cour carrelée.', keywords: ['cafe', 'walks', 'culture'], moods: ['calme', 'decouverte', 'romantique'], groups: ALL, environment: MIXED, durationMin: 60, image: photo.cafe, source: S.lonely},
  {name: 'Café Houasse', categoryId: 2, subtitle: 'Café traditionnel face au Saf-Saf', address: 'Centre de La Marsa, face au Café Saf-Saf', latitude: 36.8788, longitude: 10.3253, averagePrice: 8, description: 'Café traditionnel aux hauts plafonds et carreaux anciens.', keywords: ['cafe'], moods: ['calme', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 45, image: photo.cafe, source: S.lonely},
  {name: 'Café des Nattes', categoryId: 2, subtitle: 'Café mythique de Sidi Bou Saïd', address: 'Place du village, Sidi Bou Saïd', latitude: 36.8707, longitude: 10.3418, averagePrice: 12, description: 'Café traditionnel au décor andalou où travaillait le peintre Paul Klee : thé à la menthe et café turc.', keywords: ['cafe', 'culture', 'walks'], moods: ['calme', 'romantique', 'decouverte'], groups: ALL, environment: MIXED, durationMin: 45, image: photo.terrace, source: S.wvSidi},
  {name: 'Café des Délices', categoryId: 2, subtitle: 'Terrasses en gradins face à la mer', address: 'Sidi Bou Saïd, au-dessus du port de plaisance', latitude: 36.8705, longitude: 10.3488, averagePrice: 15, description: 'Terrasses à flanc de falaise avec l’une des plus belles vues sur le golfe de Tunis.', keywords: ['cafe', 'walks'], moods: ['romantique', 'calme', 'decouverte'], groups: ALL, environment: OUTDOOR, weatherSensitive: true, durationMin: 60, image: photo.terrace, source: S.wvSidi},
  {name: 'Coste Café', categoryId: 2, subtitle: 'Café à Sidi Bou Saïd', address: 'Avenue du 14 Janvier, Sidi Bou Saïd', latitude: 36.8695, longitude: 10.3400, averagePrice: 15, hours: {open: '09:00', close: '23:00'}, description: 'Café de l’avenue principale de Sidi Bou Saïd, ouvert du matin au soir.', keywords: ['cafe'], moods: ['calme', 'decouverte'], groups: ALL, environment: MIXED, durationMin: 60, image: photo.cafe, source: S.wvSidi},
  {name: 'Café Chaouachine', categoryId: 2, subtitle: 'Café sous les voûtes du souk', address: 'Souk Chaouachia, Médina, Tunis', latitude: 36.7985, longitude: 10.1695, averagePrice: 8, description: 'Tables dans les passages voûtés du souk des chéchias : thé à la menthe, café, chicha.', keywords: ['cafe', 'culture', 'walks'], moods: ['calme', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 45, image: photo.cafe, source: S.lonely},
  {name: 'Café M’Rabet', categoryId: 2, subtitle: 'Café historique des souks', address: 'Souk Et-Trouk, Médina, Tunis', latitude: 36.7972, longitude: 10.1705, averagePrice: 15, description: 'Café-restaurant historique au cœur des souks de la médina.', keywords: ['cafe', 'culture'], moods: ['calme', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 45, image: photo.cafe, source: S.wvTunis},
  {name: 'Panorama Medina Café', categoryId: 2, subtitle: 'Toit-terrasse avec vue sur la Zitouna', address: 'Derrière la mosquée Zitouna, Médina, Tunis', latitude: 36.7970, longitude: 10.1715, averagePrice: 10, description: 'Café sur les toits de la médina avec vue sur la cour de la mosquée Zitouna.', keywords: ['cafe', 'culture'], moods: ['calme', 'romantique', 'decouverte'], groups: ALL, environment: OUTDOOR, weatherSensitive: true, durationMin: 45, image: photo.terrace, source: S.lonely},
  {name: 'Café Ben Yedder', categoryId: 2, subtitle: 'Torréfacteur historique depuis 1934', address: 'Près du Marché central, centre-ville, Tunis', latitude: 36.7980, longitude: 10.1780, averagePrice: 6, description: 'Cafétéria du torréfacteur préféré des Tunisiens, près du Marché central.', keywords: ['cafe'], moods: ['calme', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 30, image: photo.cafe, source: S.lonely},
  {name: 'La Casa del Caffè', categoryId: 2, subtitle: 'Café à l’italienne', address: 'Centre-ville, Tunis', latitude: 36.8010, longitude: 10.1810, averagePrice: 10, description: 'Café à l’italienne préparé par des baristas, et petite restauration à prix doux.', keywords: ['cafe'], moods: ['calme', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 45, image: photo.cafe, source: S.lonely},
  {name: 'La Croisette du Lac', categoryId: 2, subtitle: 'Café sur la corniche du Lac', address: 'Corniche des Berges du Lac, Tunis', latitude: 36.8330, longitude: 10.2380, averagePrice: 15, description: 'Sur la corniche, guirlandes lumineuses et ambiance familiale.', keywords: ['cafe', 'walks'], moods: ['calme', 'familial', 'romantique'], groups: ALL, environment: MIXED, durationMin: 60, image: photo.terrace, source: S.lonely},

  // ───────────── Pâtisseries et glaciers ─────────────
  {name: 'Gourmandise La Marsa', replaces: 'Gourmandise La Marsa — Démo', categoryId: 2, subtitle: 'Pâtisserie et salon de thé', address: 'La Marsa', latitude: 36.8785, longitude: 10.3261, averagePrice: 15, description: 'Enseigne de pâtisseries tunisiennes et occidentales, présente aussi au Menzah, au Bardo et à Sidi Bou Saïd.', keywords: ['pastry', 'cafe'], moods: ['calme', 'familial', 'romantique'], groups: ALL, environment: INDOOR, durationMin: 40, image: photo.pastry, source: S.pastry},
  {name: 'Maison Masmoudi — La Marsa', categoryId: 2, subtitle: 'Pâtisserie tunisienne fine', address: 'La Marsa', latitude: 36.8792, longitude: 10.3210, averagePrice: 20, description: 'Maison de pâtisserie tunisienne fine, aussi à L’Aouina, au Kram, à Ennasr II et à Ariana.', keywords: ['pastry'], moods: ['calme', 'familial', 'romantique'], groups: ALL, environment: INDOOR, durationMin: 30, image: photo.pastry, source: S.pastry},
  {name: 'Boulevard des Capucines', categoryId: 2, subtitle: 'Pâtisserie française', address: '2 rue Tarafa Ibnou El Abd, La Marsa', latitude: 36.8820, longitude: 10.3250, averagePrice: 18, description: 'Gâteaux et éclairs de pâtisserie française.', keywords: ['pastry'], moods: ['calme', 'romantique', 'familial'], groups: ALL, environment: INDOOR, durationMin: 30, image: photo.pastry, source: S.pastry},
  {name: 'Frédéric Cassel Tunis', categoryId: 2, subtitle: 'Pâtisserie fine et salon', address: 'Avenue du Lac Nord, Les Berges du Lac 1, Tunis', latitude: 36.8340, longitude: 10.2350, averagePrice: 30, description: 'Pâtisseries sucrées et salées du chef français, avec un espace restaurant.', keywords: ['pastry', 'cafe', 'brunch'], moods: ['romantique', 'calme', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 45, image: photo.pastry, source: S.pastry},
  {name: 'Vagary', categoryId: 2, subtitle: 'Pâtisserie créative', address: 'Avenue Hédi Nouira, Résidence la Princesse, Ennasr 2, Ariana', latitude: 36.8595, longitude: 10.1640, averagePrice: 18, description: 'Pâtisserie aux saveurs et textures travaillées à Ennasr.', keywords: ['pastry'], moods: ['calme', 'romantique', 'familial'], groups: ALL, environment: INDOOR, durationMin: 30, image: photo.pastry, source: S.pastry},
  {name: 'Parad’Ice — La Marsa', categoryId: 2, subtitle: 'Glacier, crêpes et gaufres', address: '2 bis avenue de la République, La Marsa', latitude: 36.8785, longitude: 10.3240, phone: '+216 29 588 885', averagePrice: 12, hours: {open: '12:00', close: '23:00'}, description: 'Glaces artisanales à l’italienne, crêpes et gaufres. Ferme plus tard l’été.', keywords: ['pastry'], moods: ['familial', 'romantique', 'calme'], groups: ALL, environment: MIXED, durationMin: 30, image: photo.pastry, source: S.paradice},
  {name: 'Parad’Ice — Lac 1', categoryId: 2, subtitle: 'Glacier sur la corniche', address: 'Boulevard Cheikh Zayed, corniche du Lac 1, Tunis', latitude: 36.8320, longitude: 10.2400, phone: '+216 29 588 885', averagePrice: 12, hours: {open: '12:00', close: '23:00'}, description: 'Glaces artisanales à l’italienne au bord de la corniche du Lac. Ferme plus tard l’été.', keywords: ['pastry'], moods: ['familial', 'romantique', 'calme'], groups: ALL, environment: MIXED, durationMin: 30, image: photo.pastry, source: S.paradice},
  {name: 'Il Gelato Italiano', categoryId: 2, subtitle: 'Glacier, gelato à l’italienne', address: '14 avenue d’Afrique, El Menzah 5, Tunis', latitude: 36.8460, longitude: 10.1780, averagePrice: 10, description: 'Glaces à l’italienne, goût authentique.', keywords: ['pastry'], moods: ['familial', 'calme'], groups: ALL, environment: INDOOR, durationMin: 30, image: photo.pastry, source: S.ice},
  {name: 'Vinky Gelato', categoryId: 2, subtitle: 'Glaces artisanales', address: '88 avenue Hédi Nouira, Résidence les Dahlias, Ennasr, Ariana', latitude: 36.8585, longitude: 10.1610, averagePrice: 10, description: 'Recettes originales de glaces artisanales à Ennasr.', keywords: ['pastry'], moods: ['familial', 'calme'], groups: ALL, environment: INDOOR, durationMin: 30, image: photo.pastry, source: S.ice},

  // ───────────── Sorties et vie nocturne ─────────────
  {name: 'Le Bœuf sur le Toit', categoryId: 3, subtitle: 'Restaurant, live et piste de danse', address: '3 avenue Fatouma Bourguiba, La Soukra', latitude: 36.8790, longitude: 10.2440, averagePrice: 60, description: 'Dîner, concerts, DJ et piste de danse à La Soukra.', keywords: ['nightlife', 'restaurant'], moods: ['festif'], groups: ['couple', 'amis'], environment: INDOOR, durationMin: 120, image: photo.bar, source: S.wvTunis},
  {name: 'Tiki Bar', categoryId: 3, subtitle: 'Bar de plage au Ramada Plaza', address: 'Hôtel Ramada Plaza, Gammarth', latitude: 36.9150, longitude: 10.2870, averagePrice: 40, description: 'Bar de plage de Gammarth ; rap et hip-hop en live du jeudi au samedi.', keywords: ['nightlife'], moods: ['festif'], groups: ['couple', 'amis'], environment: OUTDOOR, weatherSensitive: true, durationMin: 120, image: photo.bar, source: S.lonely},
  {name: 'Dar El Marsa', categoryId: 3, subtitle: 'Rooftop avec vue sur la plage', address: 'La Marsa', latitude: 36.8805, longitude: 10.3300, averagePrice: 50, description: 'Bar-restaurant en rooftop avec vue à 360° sur la plage de La Marsa.', keywords: ['nightlife', 'restaurant'], moods: ['romantique', 'festif'], groups: ['couple', 'amis'], environment: OUTDOOR, weatherSensitive: true, durationMin: 90, image: photo.bar, source: S.lonely},

  // ───────────── Loisirs ─────────────
  {name: 'Escape Room Tunisia — La Marsa', replaces: 'Escape Room Tunisia — Démo', categoryId: 3, subtitle: 'Escape game en équipe (2 à 6 joueurs)', address: 'Rue Aïn Zaghouan, La Marsa', latitude: 36.8640, longitude: 10.3080, phone: '+216 22 76 22 74', averagePrice: 35, description: 'Salles Virus, Sabotage et Prison Break, 60 minutes de jeu. 35 DT par personne à 2 ou 3 joueurs, 30 DT dès 4. Arriver 20 minutes avant.', keywords: ['gaming', 'leisure'], moods: ['festif', 'decouverte'], groups: ['couple', 'amis', 'famille'], environment: INDOOR, durationMin: 80, image: photo.escape, source: 'https://www.escaperoomtunisia.tn/en/'},
  {name: 'Escape Room Tunisia — Bardo', categoryId: 3, subtitle: 'Escape game en équipe (2 à 6 joueurs)', address: '3 rue des Jacinthes, Bardo 2', latitude: 36.8080, longitude: 10.1400, phone: '+216 28 55 46 70', averagePrice: 35, description: 'Salles Virus, Sabotage et Prison Break, 60 minutes de jeu. 35 DT par personne à 2 ou 3 joueurs, 30 DT dès 4.', keywords: ['gaming', 'leisure'], moods: ['festif', 'decouverte'], groups: ['couple', 'amis', 'famille'], environment: INDOOR, durationMin: 80, image: photo.escape, source: 'https://www.escaperoomtunisia.tn/en/'},
  {name: 'Elharba Escape Room', categoryId: 3, subtitle: 'Escape game immersif (2 à 8 joueurs)', address: 'La Manouba', latitude: 36.8080, longitude: 10.0970, phone: '+216 28 720 530', averagePrice: 30, hours: {open: '11:30', close: '23:59'}, description: 'Salles Stranger Things et Annabelle, 60 minutes, à partir de 30 DT par personne.', keywords: ['gaming', 'leisure'], moods: ['festif', 'decouverte'], groups: ['couple', 'amis'], environment: INDOOR, durationMin: 80, image: photo.escape, source: 'https://elharba.tn/en'},
  {name: 'Pathé Tunis City', replaces: 'Pathé Tunis City — Démo', categoryId: 3, subtitle: 'Cinéma multiplexe', address: 'Centre commercial Tunis City, Cebalat Ben Ammar, Ariana', latitude: 36.9017, longitude: 10.1907, averagePrice: 15, description: 'Multiplexe Pathé du centre commercial Tunis City. Programme et tarifs sur pathe.tn.', keywords: ['cinema', 'leisure'], moods: ['romantique', 'calme', 'familial', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 130, image: photo.cinema, source: 'https://icicine.com/en/cinema/tunisia/pathe-tunis-city'},
  {name: 'Pathé Azur City', categoryId: 3, subtitle: 'Cinéma multiplexe', address: 'Centre commercial Azur City, Bou Mhel el-Bassatine, Ben Arous', latitude: 36.7350, longitude: 10.2950, averagePrice: 15, description: 'Multiplexe Pathé du centre commercial Azur City. Programme et tarifs sur pathe.tn.', keywords: ['cinema', 'leisure'], moods: ['romantique', 'calme', 'familial', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 130, image: photo.cinema, source: 'https://icicine.com/en/cinema/tunisia/pathe-azur-city'},

  // ───────────── Culture ─────────────
  {name: 'Musée national du Bardo', categoryId: 3, subtitle: 'Mosaïques romaines dans un palais beylical', address: 'Le Bardo (métro ligne 4, station Bardo)', latitude: 36.8094, longitude: 10.1344, averagePrice: 9, hours: {open: '09:30', close: '16:30', closedDays: [1]}, description: 'L’une des plus grandes collections de mosaïques romaines au monde. 9 DT pour les résidents, gratuit le premier dimanche du mois.', keywords: ['culture'], moods: ['decouverte', 'calme', 'familial'], groups: ALL, environment: INDOOR, durationMin: 120, image: photo.culture, source: S.museums},
  {name: 'Site archéologique de Carthage', categoryId: 3, subtitle: 'Thermes d’Antonin, Byrsa et ports puniques', address: 'Carthage', latitude: 36.8528, longitude: 10.3236, averagePrice: 9, description: 'Ruines romaines et puniques de Carthage. 9 DT pour les résidents, gratuit le premier dimanche du mois.', keywords: ['culture', 'walks'], moods: ['decouverte', 'calme', 'familial', 'romantique'], groups: ALL, environment: OUTDOOR, weatherSensitive: true, durationMin: 120, image: photo.culture, source: S.museums},
  {name: 'Dar Ben Abdallah', categoryId: 3, subtitle: 'Musée du patrimoine traditionnel', address: 'Rue Sidi Kacem, Médina, Tunis', latitude: 36.7935, longitude: 10.1705, averagePrice: 5, hours: {open: '09:30', close: '16:30', closedDays: [1]}, description: 'Petit musée des arts et traditions dans un palais du XVIIIe siècle : faïences, stucs, costumes.', keywords: ['culture'], moods: ['decouverte', 'calme'], groups: ALL, environment: INDOOR, durationMin: 60, image: photo.culture, source: S.wvTunis},
  {name: 'Palais Ennejma Ezzahra', categoryId: 3, subtitle: 'Palais du baron d’Erlanger, musiques arabes', address: '8 rue du 2 Mars 1934, Sidi Bou Saïd', latitude: 36.8700, longitude: 10.3445, phone: '+216 71 746 051', averagePrice: 10, description: 'Ancien palais du baron Rodolphe d’Erlanger, aujourd’hui centre des musiques arabes et méditerranéennes.', keywords: ['culture'], moods: ['decouverte', 'calme', 'romantique'], groups: ALL, environment: MIXED, durationMin: 75, image: photo.culture, source: S.wvSidi},

  // ───────────── Balades gratuites ─────────────
  {name: 'Balade dans la médina de Tunis', categoryId: 3, subtitle: 'Souks, Zitouna et ruelles historiques', address: 'Médina de Tunis, depuis Bab Bhar', latitude: 36.7990, longitude: 10.1760, averagePrice: 0, description: 'Promenade libre dans les souks et ruelles de la médina, classée au patrimoine mondial.', keywords: ['walks', 'culture'], moods: ['decouverte', 'calme', 'familial'], groups: ALL, environment: OUTDOOR, weatherSensitive: true, durationMin: 60, image: photo.culture, source: 'https://generationvoyage.fr/?p=283797'},
  {name: 'Lab Station', categoryId: 1, subtitle: 'Burgers, tacos et smokehouse', address: 'Avenue Hédi Nouira, Ennasr, Ariana', latitude: 36.8558, longitude: 10.1586, phone: '+216 21 722 108', averagePrice: 18, hours: {open: '12:00', close: '01:00', days: {5: {open: '14:00', close: '01:00'}}}, description: 'Burgers gourmands (Classic, Burger Lab, Texas, Crispy Chicken), tacos, ribs et brisket fumé. Ouvert tard, jusqu’à 1h du matin.', keywords: ['restaurant', 'fast_food'], moods: ['festif', 'decouverte'], groups: ALL, environment: INDOOR, durationMin: 60, image: photo.street, source: 'https://lab-station.grubbio.com/'},
  {name: 'Corniche des Berges du Lac', categoryId: 3, subtitle: 'Promenade au bord du lac', address: 'Corniche des Berges du Lac, Tunis', latitude: 36.8325, longitude: 10.2390, averagePrice: 0, description: 'Promenade piétonne au bord du lac, animée en soirée.', keywords: ['walks'], moods: ['calme', 'romantique', 'familial'], groups: ALL, environment: OUTDOOR, weatherSensitive: true, durationMin: 45, image: photo.terrace, source: S.lonely},
  // ───────────── Maisons d'hôtes (catégorie 4) ─────────────
  // Tarifs « dès … la nuit » repris de l'annuaire maisonsdhotestunisie.com ou du site de la maison :
  // indicatifs, variables selon la saison et la chambre. Coordonnées au niveau de la ville ou du quartier.
  {name: 'Dar Ben Gacem — Pacha', categoryId: 4, subtitle: 'Maison d’hôtes de charme en médina', address: '38 rue du Pacha, Médina, Tunis', latitude: 36.8002, longitude: 10.1688, phone: '+216 23 066 666', averagePrice: null, description: 'Demeure restaurée au cœur de la médina de Tunis. Transfert aéroport, petit-déjeuner et expériences culturelles sur demande. Seconde maison rue El Kahia.', keywords: ['guesthouse', 'culture'], moods: ['romantique', 'calme', 'decouverte'], groups: ['couple', 'amis', 'famille', 'solo'], environment: INDOOR, durationMin: 720, image: photo.stay, source: 'https://www.darbengacem.com/contact'},
  {name: 'Dar Ben Gacem — Kahia', categoryId: 4, subtitle: 'Maison d’hôtes de charme en médina', address: '16 rue El Kahia, Médina, Tunis', latitude: 36.7990, longitude: 10.1680, phone: '+216 23 066 666', averagePrice: null, description: 'Seconde maison Dar Ben Gacem, à quatre minutes à pied de Dar Pacha.', keywords: ['guesthouse', 'culture'], moods: ['romantique', 'calme', 'decouverte'], groups: ['couple', 'amis', 'famille', 'solo'], environment: INDOOR, durationMin: 720, image: photo.stay, source: 'https://www.darbengacem.com/contact'},
  {name: 'Dar El Médina', categoryId: 4, subtitle: 'Demeure centenaire en médina · dès 200 DT la nuit', address: '64 rue Sidi Ben Arous, Médina, Tunis', latitude: 36.7992, longitude: 10.1702, averagePrice: null, nightlyPrice: 200, description: 'Hôtel de charme dans une demeure centenaire de la médina. Accès conseillé en taxi jusqu’à la place du Gouvernement.', keywords: ['guesthouse', 'culture'], moods: ['romantique', 'calme', 'decouverte'], groups: ['couple', 'famille', 'solo'], environment: INDOOR, durationMin: 720, image: photo.stay, source: S.wvTunis},
  {name: 'Dar Dorra', categoryId: 4, subtitle: 'Maison d’hôtes en médina · dès 300 DT la nuit', address: 'Médina de Tunis', latitude: 36.7980, longitude: 10.1695, averagePrice: null, nightlyPrice: 300, description: 'Maison d’hôtes dans la médina de Tunis.', keywords: ['guesthouse'], moods: ['calme', 'decouverte'], groups: ['couple', 'famille', 'solo'], environment: INDOOR, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Saïd', categoryId: 4, subtitle: 'Hôtel de charme, 23 chambres et hammam', address: 'Rue Toumi, Sidi Bou Saïd', latitude: 36.8716, longitude: 10.3437, phone: '+216 71 729 666', averagePrice: null, roomCount: 23, description: '23 chambres et suites autour de quatre patios, vue sur la mer et le village, hammam traditionnel et restaurant Dar Zarrouk.', keywords: ['guesthouse'], moods: ['romantique', 'calme'], groups: ['couple', 'famille', 'solo'], environment: MIXED, durationMin: 720, image: photo.stay, source: 'https://www.darsaid.com.tn/en/'},
  {name: 'Maison Dedine', categoryId: 4, subtitle: 'Maison d’hôtes à Sidi Bou Saïd · dès 810 DT la nuit', address: 'Sidi Bou Saïd', latitude: 36.8705, longitude: 10.3430, averagePrice: null, nightlyPrice: 810, description: 'Maison d’hôtes haut de gamme à Sidi Bou Saïd.', keywords: ['guesthouse'], moods: ['romantique', 'calme'], groups: ['couple', 'famille'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'La Demeure', categoryId: 4, subtitle: 'Maison d’hôtes à Sidi Bou Saïd · dès 500 DT la nuit', address: 'Sidi Bou Saïd', latitude: 36.8700, longitude: 10.3415, averagePrice: null, nightlyPrice: 500, description: 'Maison d’hôtes à Sidi Bou Saïd.', keywords: ['guesthouse'], moods: ['romantique', 'calme'], groups: ['couple', 'famille'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Souad', categoryId: 4, subtitle: 'Maison d’hôtes à La Marsa · dès 300 DT la nuit', address: 'La Marsa', latitude: 36.8790, longitude: 10.3230, averagePrice: null, nightlyPrice: 300, description: 'Maison d’hôtes à La Marsa, près de la plage.', keywords: ['guesthouse'], moods: ['calme', 'familial'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Zaghouan', categoryId: 4, subtitle: 'Maison d’hôtes et gîte rural · dès 260 DT la nuit', address: 'Zaghouan', latitude: 36.4029, longitude: 10.1429, averagePrice: null, nightlyPrice: 260, description: 'Maison d’hôtes et gîte rural au pied du djebel Zaghouan, à environ une heure de Tunis.', keywords: ['guesthouse', 'walks'], moods: ['calme', 'familial', 'decouverte'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: 'https://maisonsdhotesentunisie.com/dar-zaghouan-zaghouan/'},
  {name: 'Borj Waly', categoryId: 4, subtitle: 'Maison d’hôtes à Zaghouan · dès 600 DT la nuit', address: 'Zaghouan', latitude: 36.4100, longitude: 10.1500, averagePrice: null, nightlyPrice: 600, description: 'Maison d’hôtes de la région de Zaghouan.', keywords: ['guesthouse'], moods: ['calme', 'romantique'], groups: ['couple', 'famille'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Ichkeul', categoryId: 4, subtitle: 'Près du parc de l’Ichkeul · dès 410 DT la nuit', address: 'Mateur, Bizerte', latitude: 37.0400, longitude: 9.6650, averagePrice: null, nightlyPrice: 410, description: 'Maison d’hôtes près du parc national de l’Ichkeul.', keywords: ['guesthouse', 'walks'], moods: ['calme', 'decouverte', 'familial'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar El Karma', categoryId: 4, subtitle: 'Maison d’hôtes à Tabarka · dès 320 DT la nuit', address: 'Tabarka', latitude: 36.9544, longitude: 8.7580, averagePrice: null, nightlyPrice: 320, description: 'Grande maison d’hôtes de Tabarka, jusqu’à 30 couchages.', keywords: ['guesthouse'], moods: ['calme', 'familial', 'decouverte'], groups: ['famille', 'amis', 'couple'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Kadra', categoryId: 4, subtitle: 'Maison d’hôtes à Hammamet · dès 440 DT la nuit', address: 'Hammamet', latitude: 36.4000, longitude: 10.6167, averagePrice: null, nightlyPrice: 440, description: 'Maison d’hôtes à Hammamet.', keywords: ['guesthouse'], moods: ['calme', 'romantique', 'familial'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Colibri', categoryId: 4, subtitle: 'Maison d’hôtes à Kélibia · dès 310 DT la nuit', address: 'Kélibia', latitude: 36.8475, longitude: 11.0939, averagePrice: null, nightlyPrice: 310, description: 'Maison d’hôtes à Kélibia, au Cap Bon.', keywords: ['guesthouse'], moods: ['calme', 'familial'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Antonia', categoryId: 4, subtitle: 'Maison d’hôtes à Sousse · dès 340 DT la nuit', address: 'Sousse', latitude: 35.8256, longitude: 10.6370, averagePrice: null, nightlyPrice: 340, description: 'Maison d’hôtes à Sousse.', keywords: ['guesthouse'], moods: ['calme', 'decouverte'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar El Hamra', categoryId: 4, subtitle: 'Maison d’hôtes à Mahdia · dès 400 DT la nuit', address: 'Mahdia', latitude: 35.5047, longitude: 11.0622, averagePrice: null, nightlyPrice: 400, description: 'Maison d’hôtes à Mahdia.', keywords: ['guesthouse'], moods: ['calme', 'romantique'], groups: ['couple', 'famille'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Tozeur', categoryId: 4, subtitle: 'Maison d’hôtes à Tozeur · dès 600 DT la nuit', address: 'Tozeur', latitude: 33.9197, longitude: 8.1335, averagePrice: null, nightlyPrice: 600, description: 'Maison d’hôtes de la médina de Tozeur.', keywords: ['guesthouse', 'culture'], moods: ['romantique', 'calme', 'decouverte'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Saida Beya', categoryId: 4, subtitle: 'Maison d’hôtes à Tozeur · dès 380 DT la nuit', address: 'Tozeur', latitude: 33.9180, longitude: 8.1300, averagePrice: null, nightlyPrice: 380, description: 'Maison d’hôtes à Tozeur.', keywords: ['guesthouse'], moods: ['calme', 'decouverte'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Diar Abou Habibi', categoryId: 4, subtitle: 'Maisons dans la palmeraie de Tozeur · dès 500 DT la nuit', address: 'Tozeur', latitude: 33.9100, longitude: 8.1250, averagePrice: null, nightlyPrice: 500, description: 'Hébergement dans la palmeraie de Tozeur, jusqu’à 22 couchages.', keywords: ['guesthouse', 'walks'], moods: ['calme', 'romantique', 'decouverte'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Zargouni', categoryId: 4, subtitle: 'Vue sur le chott et les dunes · dès 450 DT la nuit', address: 'Nefta', latitude: 33.8730, longitude: 7.8800, averagePrice: null, nightlyPrice: 450, description: 'Maison d’hôtes de Nefta avec vue sur le Chott el-Jérid et les dunes.', keywords: ['guesthouse'], moods: ['romantique', 'calme'], groups: ['couple', 'famille'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
  {name: 'Dar Dhiafa', categoryId: 4, subtitle: 'Maison d’hôtes à Erriadh, 15 chambres · dès 110 € la nuit', address: 'Hara Sghira, Erriadh, Djerba', latitude: 33.8200, longitude: 10.8580, phone: '+216 75 671 166', averagePrice: null, roomCount: 15, description: 'Cinq maisons traditionnelles restaurées : 15 chambres, deux piscines, hammam et restaurant. Petit-déjeuner inclus. À 10 minutes de Houmt Souk.', keywords: ['guesthouse'], moods: ['romantique', 'calme'], groups: ['couple', 'famille', 'solo'], environment: MIXED, durationMin: 720, image: photo.stay, source: 'https://dhiefa.com/dar-dhiafa-prix-avis-contact/'},
  {name: 'Dar Lily Erriadh', categoryId: 4, subtitle: 'Maison d’hôtes à Djerba · dès 200 DT la nuit', address: 'Erriadh, Djerba', latitude: 33.8215, longitude: 10.8600, averagePrice: null, nightlyPrice: 200, description: 'Maison d’hôtes à Erriadh, le village des street-arts de Djerbahood.', keywords: ['guesthouse', 'culture'], moods: ['calme', 'decouverte'], groups: ['couple', 'famille', 'amis'], environment: MIXED, durationMin: 720, image: photo.stay, source: S.dirStays},
];

/** Ajoute ou met à jour les lieux réels (sans toucher aux réservations ni aux comptes). */
export async function seedRealPlaces(prisma: import('@prisma/client').PrismaClient) {
  const saved = [];
  for (const place of realPlaces) {
    const {replaces, hours, keywords, moods, groups, durationMin, source: _source, nightlyPrice, roomCount, ...fields} = place;
    const existing = await prisma.place.findFirst({where: {name: place.name}})
      ?? (replaces ? await prisma.place.findFirst({where: {name: replaces}}) : null);
    const data = {
      ...fields,
      phone: fields.phone ?? null,
      email: null,
      schedule: hours ? `${hours.open} - ${hours.close}` : null,
      verified: false,
      cuisineType: keywords.join(', '),
      ambienceTags: keywords,
      suitabilityMoods: moods,
      groupTypes: groups,
      weatherSensitive: fields.weatherSensitive ?? false,
      defaultDurationMin: durationMin,
      nightlyPrice: nightlyPrice ?? null,
      roomCount: roomCount ?? null,
      capacityPerSlot: place.categoryId === 2 ? 16 : place.categoryId === 4 ? 4 : 30,
    };
    const row = existing
      ? await prisma.place.update({where: {id: existing.id}, data})
      : await prisma.place.create({data});
    saved.push(row);
    await prisma.placeCategory.createMany({data: [{placeId: row.id, categoryId: row.categoryId}], skipDuplicates: true});
    if (hours) {
      for (let weekday = 0; weekday <= 6; weekday += 1) {
        const isClosed = hours.closedDays?.includes(weekday) ?? false;
        const {open, close} = hours.days?.[weekday] ?? hours;
        await prisma.placeOpeningHour.upsert({
          where: {placeId_weekday: {placeId: row.id, weekday}},
          update: {openTime: open, closeTime: close, isClosed},
          create: {placeId: row.id, weekday, openTime: open, closeTime: close, isClosed},
        });
      }
    } else {
      // Horaires inconnus : on retire d'éventuels horaires inventés par l'ancienne fiche de démonstration.
      await prisma.placeOpeningHour.deleteMany({where: {placeId: row.id}});
    }
  }
  return saved;
}
