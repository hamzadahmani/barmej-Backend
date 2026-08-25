import {PrismaClient, ReservationStatus} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const image = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

async function main() {
  const categoryData = [
    {id: 1, name: 'Restaurants', image: image('photo-1515003197210-e0cd71810b5f')},
    {id: 2, name: 'Cafés', image: image('photo-1501339847302-ac426a4a7cbb')},
    {id: 3, name: 'Sorties', image: image('photo-1514933651103-005eec06c04b')},
  ];
  await Promise.all(
    categoryData.map(data =>
      prisma.category.upsert({where: {id: data.id}, update: data, create: data}),
    ),
  );

  const demoUser = await prisma.user.upsert({
    where: {email: 'demo@barmej.app'},
    update: {firstName: 'Amine', lastName: 'Démo', mobile: '22123456'},
    create: {
      email: 'demo@barmej.app',
      passwordHash: await bcrypt.hash('Demo123!', 12),
      firstName: 'Amine',
      lastName: 'Démo',
      mobile: '22123456',
      gender: 'H',
      photo: image('photo-1535713875002-d1d0cf377fde'),
    },
  });

  const places = [
    {name: 'Le Patio', subtitle: 'Cuisine méditerranéenne', image: image('photo-1517248135467-4c7edcad34c4'), latitude: 36.8065, longitude: 10.1815, categoryId: 1, address: '12 rue de Marseille, Tunis', schedule: '09:00 - 23:00', description: 'Une cuisine méditerranéenne généreuse dans un patio lumineux.', outfit: 'Décontracté,Élégant', musicStyle: 'Lounge,Jazz', happyHour: '17:00 - 19:00'},
    {name: 'Dar El Jeld', subtitle: 'Cuisine tunisienne raffinée', image: image('photo-1550966871-3ed3cdb5ed0c'), latitude: 36.7988, longitude: 10.1686, categoryId: 1, address: '5 rue Dar El Jeld, Médina', schedule: '12:00 - 23:00', description: 'Les grands classiques tunisiens dans un décor historique.', outfit: 'Élégant', musicStyle: 'Traditionnel'},
    {name: 'La Table du Marché', subtitle: 'Cuisine française contemporaine', image: image('photo-1552566626-52f8b828add9'), latitude: 36.8327, longitude: 10.2305, categoryId: 1, address: 'Les Berges du Lac 1', schedule: '11:30 - 23:30', description: 'Des produits frais et une carte de saison.', outfit: 'Smart casual', musicStyle: 'Acoustique'},
    {name: 'The Cliff', subtitle: 'Restaurant avec vue sur mer', image: image('photo-1544148103-0773bf10d330'), latitude: 36.8686, longitude: 10.349, categoryId: 1, address: 'La Marsa, Tunis', schedule: '12:00 - 00:00', description: 'Une terrasse spectaculaire face à la Méditerranée.', outfit: 'Élégant', musicStyle: 'Deep house,Lounge'},
    {name: 'Bambalouni & Co', subtitle: 'Street food tunisienne', image: image('photo-1565299507177-b0ac66763828'), latitude: 36.8782, longitude: 10.3255, categoryId: 1, address: 'Sidi Bou Saïd', schedule: '10:00 - 22:30', description: 'Une adresse conviviale aux saveurs populaires tunisiennes.', outfit: 'Décontracté', musicStyle: 'Pop'},

    {name: 'Café des Arts', subtitle: 'Café et pâtisserie', image: image('photo-1501339847302-ac426a4a7cbb'), latitude: 36.8121, longitude: 10.1762, categoryId: 2, address: 'Avenue de Paris, Tunis', schedule: '08:00 - 22:00', description: 'Café de spécialité et pâtisseries maison.', outfit: 'Décontracté', musicStyle: 'Jazz,Lo-fi'},
    {name: 'Cosmitto Coffee', subtitle: 'Café de spécialité', image: image('photo-1445116572660-236099ec97a0'), latitude: 36.8464, longitude: 10.2771, categoryId: 2, address: 'Lac 2, Tunis', schedule: '07:30 - 21:30', description: 'Des cafés sélectionnés et torréfiés pour les passionnés.', outfit: 'Décontracté', musicStyle: 'Indie,Lo-fi'},
    {name: 'Blue Café', subtitle: 'Terrasse à Sidi Bou Saïd', image: image('photo-1554118811-1e0d58224f24'), latitude: 36.8708, longitude: 10.3414, categoryId: 2, address: 'Rue Hédi Zarrouk', schedule: '08:00 - 23:00', description: 'Thé aux pignons et vue imprenable.', outfit: 'Décontracté', musicStyle: 'Oriental'},
    {name: 'Flamingo Café', subtitle: 'Brunch et gourmandises', image: image('photo-1521017432531-fbd92d768814'), latitude: 36.8353, longitude: 10.2351, categoryId: 2, address: 'Les Berges du Lac', schedule: '08:00 - 20:00', description: 'Une carte brunch colorée et des jus frais.', outfit: 'Décontracté', musicStyle: 'Pop,Acoustique'},
    {name: 'North Shore Coffee', subtitle: 'Coffee shop moderne', image: image('photo-1509042239860-f550ce710b93'), latitude: 36.887, longitude: 10.325, categoryId: 2, address: 'La Marsa, Tunis', schedule: '07:00 - 21:00', description: 'Un espace lumineux idéal pour travailler.', outfit: 'Décontracté', musicStyle: 'Lo-fi'},

    {name: 'La Terrasse', subtitle: 'Vue panoramique', image: image('photo-1414235077428-338989a2e8c0'), latitude: 36.799, longitude: 10.18, categoryId: 3, address: 'Centre-ville, Tunis', schedule: '18:00 - 02:00', description: 'Cocktails signatures et panorama sur Tunis.', outfit: 'Smart casual', musicStyle: 'House,Lounge'},
    {name: 'Yüka', subtitle: 'Musique live et rooftop', image: image('photo-1519167758481-83f550bb49b3'), latitude: 36.8832, longitude: 10.331, categoryId: 3, address: 'Gammarth, Tunis', schedule: '19:00 - 03:00', description: 'Une programmation musicale éclectique.', outfit: 'Tendance', musicStyle: 'Live,Électro'},
    {name: 'Le Carpe Diem', subtitle: 'Club et restaurant', image: image('photo-1571266028243-d220c9c3b2d2'), latitude: 36.9086, longitude: 10.2849, categoryId: 3, address: 'Route de Gammarth', schedule: '20:00 - 04:00', description: 'Dîner, spectacles et soirées dansantes.', outfit: 'Élégant', musicStyle: 'Électro,Commercial'},
    {name: 'Le Plug', subtitle: 'Bar à cocktails', image: image('photo-1514933651103-005eec06c04b'), latitude: 36.846, longitude: 10.28, categoryId: 3, address: 'Lac 2, Tunis', schedule: '17:00 - 02:00', description: 'Cocktails créatifs, tapas et DJ sets.', outfit: 'Smart casual', musicStyle: 'Hip-hop,House'},
    {name: 'Agora', subtitle: 'Cinéma et espace culturel', image: image('photo-1489599849927-2ee91cede3ba'), latitude: 36.8822, longitude: 10.3318, categoryId: 3, address: 'La Marsa, Tunis', schedule: '10:00 - 23:30', description: 'Cinéma indépendant et événements artistiques.', outfit: 'Décontracté', musicStyle: 'Varié'},
  ];

  const savedPlaces = [];
  for (const place of places) {
    const existing = await prisma.place.findFirst({where: {name: place.name}});
    const data = {...place, phone: '+216 70 000 000', email: 'contact@barmej.app', averagePrice: place.categoryId === 2 ? 18 : place.categoryId === 1 ? 55 : 40, capacityPerSlot: place.categoryId === 2 ? 16 : 30};
    savedPlaces.push(existing ? await prisma.place.update({where: {id: existing.id}, data}) : await prisma.place.create({data}));
  }

  for (const place of savedPlaces.slice(0, 5)) {
    await prisma.favorite.upsert({where: {userId_placeId: {userId: demoUser.id, placeId: place.id}}, update: {}, create: {userId: demoUser.id, placeId: place.id}});
  }

  const reservations = [
    {place: savedPlaces[2]!, date: '2026-08-20', time: '19:30', persons: 2, status: ReservationStatus.COMPLETED},
    {place: savedPlaces[0]!, date: '2026-08-28', time: '20:00', persons: 2, status: ReservationStatus.CONFIRMED},
    {place: savedPlaces[5]!, date: '2026-08-30', time: '10:30', persons: 3, status: ReservationStatus.PENDING},
    {place: savedPlaces[10]!, date: '2026-09-05', time: '21:30', persons: 4, status: ReservationStatus.PENDING},
  ];
  for (const seed of reservations) {
    const reservationDate = new Date(`${seed.date}T00:00:00.000Z`);
    const exists = await prisma.reservation.findFirst({where: {userId: demoUser.id, placeId: seed.place.id, reservationDate, reservationTime: seed.time}});
    if (!exists) await prisma.reservation.create({data: {userId: demoUser.id, placeId: seed.place.id, reservationDate, reservationTime: seed.time, numberOfPersons: seed.persons, status: seed.status, message: 'Table calme si possible'}});
  }

  const notifications = [
    {title: 'Réservation confirmée', message: 'Votre table au Patio est confirmée pour vendredi à 20h.'},
    {title: 'Nouvelle adresse', message: 'Découvrez The Cliff, notre nouvelle sélection avec vue sur mer.'},
    {title: 'Happy hour', message: 'Le Plug propose son happy hour aujourd’hui de 17h à 19h.'},
  ];
  for (const notification of notifications) {
    const exists = await prisma.notification.findFirst({where: {userId: demoUser.id, title: notification.title}});
    if (!exists) await prisma.notification.create({data: {...notification, userId: demoUser.id}});
  }
}

main()
  .then(() => console.log('Données de démonstration ajoutées avec succès.'))
  .finally(() => prisma.$disconnect());

