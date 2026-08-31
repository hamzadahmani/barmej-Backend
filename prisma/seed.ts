import {PlaceMediaType, PrismaClient, ReservationStatus, UserRole, WaitlistStatus} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const image = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
const dateAt = (daysFromToday: number) => {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + daysFromToday);
  return value;
};

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
    const data = {...place, phone: '+216 70 000 000', email: 'contact@barmej.app', averagePrice: place.categoryId === 2 ? 18 : place.categoryId === 1 ? 55 : 40, capacityPerSlot: place.categoryId === 2 ? 16 : 30, verified: true, cuisineType: place.categoryId === 1 ? 'Méditerranéenne' : place.categoryId === 2 ? 'Café et brunch' : 'Sorties', ambienceTags: place.categoryId === 1 ? ['Romantique', 'Familial'] : place.categoryId === 2 ? ['Calme', 'Brunch'] : ['Musique', 'Festif']};
    savedPlaces.push(existing ? await prisma.place.update({where: {id: existing.id}, data}) : await prisma.place.create({data}));
  }
  await prisma.placeCategory.createMany({
    data: savedPlaces.flatMap((place, index) => [
      {placeId: place.id, categoryId: place.categoryId},
      ...(index === 0 ? [{placeId: place.id, categoryId: 3}] : []),
    ]),
    skipDuplicates: true,
  });

  // Vidéos publiques de démonstration pour tester le feed mobile. Une vidéo
  // réellement publiée par un gérant reste toujours prioritaire et intacte.
  const demoVideos = [
    {place: savedPlaces[0]!, publicId: 'barmej/demo/le-patio', secureUrl: 'https://videos.pexels.com/video-files/6603839/6603839-hd_1080_1920_25fps.mp4', duration: 15, keywords: ['Cuisine méditerranéenne', 'Romantique', 'Terrasse']},
    {place: savedPlaces[3]!, publicId: 'barmej/demo/the-cliff', secureUrl: 'https://videos.pexels.com/video-files/7008573/7008573-hd_1080_1920_25fps.mp4', duration: 15, keywords: ['Vue sur mer', 'Romantique', 'Terrasse']},
    {place: savedPlaces[5]!, publicId: 'barmej/demo/cafe-des-arts', secureUrl: 'https://videos.pexels.com/video-files/7008582/7008582-hd_1080_1920_25fps.mp4', duration: 15, keywords: ['Petit-déjeuner', 'Brunch', 'Espace calme']},
  ];
  for (const video of demoVideos) {
    const existingDemo = await prisma.placeMedia.findUnique({where: {publicId: video.publicId}});
    if (existingDemo) {
      await prisma.placeMedia.update({where: {id: existingDemo.id}, data: {secureUrl: video.secureUrl, duration: video.duration, format: 'mp4', keywords: video.keywords}});
      continue;
    }
    const realVideo = await prisma.placeMedia.findFirst({where: {placeId: video.place.id, type: PlaceMediaType.VIDEO}});
    if (!realVideo) await prisma.placeMedia.create({data: {placeId: video.place.id, publicId: video.publicId, secureUrl: video.secureUrl, type: PlaceMediaType.VIDEO, duration: video.duration, format: 'mp4', keywords: video.keywords, sortOrder: 0}});
  }

  const sponsoredVideo = await prisma.placeMedia.findUnique({where: {publicId: 'barmej/demo/le-patio'}});
  if (sponsoredVideo) {
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() - 1);
    const endsAt = new Date();
    endsAt.setUTCDate(endsAt.getUTCDate() + 30);
    const campaignData = {
      placeId: savedPlaces[0]!.id,
      videoId: sponsoredVideo.id,
      active: true,
      startsAt,
      endsAt,
      dailyBudgetCents: 3000,
      totalBudgetCents: 50000,
      bidCpmCents: 800,
      latitude: savedPlaces[0]!.latitude,
      longitude: savedPlaces[0]!.longitude,
      radiusKm: 40,
      maxImpressionsPerUserDay: 2,
    };
    const existingCampaign = await prisma.sponsoredCampaign.findFirst({where: {name: 'Le Patio — Découverte locale'}});
    if (existingCampaign) await prisma.sponsoredCampaign.update({where: {id: existingCampaign.id}, data: campaignData});
    else await prisma.sponsoredCampaign.create({data: {...campaignData, name: 'Le Patio — Découverte locale'}});
  }

  const proUser = await prisma.user.upsert({
    where: {email: 'pro@barmej.app'},
    update: {role: UserRole.ESTABLISHMENT, firstName: 'Gérant', lastName: 'Le Patio'},
    create: {email: 'pro@barmej.app', passwordHash: await bcrypt.hash('Pro12345!', 12), firstName: 'Gérant', lastName: 'Le Patio', mobile: '70000000', role: UserRole.ESTABLISHMENT},
  });
  await prisma.placeManager.upsert({where: {userId_placeId: {userId: proUser.id, placeId: savedPlaces[0]!.id}}, update: {}, create: {userId: proUser.id, placeId: savedPlaces[0]!.id}});
  const scannerUser = await prisma.user.upsert({
    where: {email: 'scanner.patio@barmej.app'},
    update: {role: UserRole.SCANNER, firstName: 'Portier', lastName: 'Le Patio'},
    create: {email: 'scanner.patio@barmej.app', passwordHash: await bcrypt.hash('Scanner123!', 12), firstName: 'Portier', lastName: 'Le Patio', mobile: '70000001', role: UserRole.SCANNER},
  });
  await prisma.placeManager.upsert({where: {userId_placeId: {userId: scannerUser.id, placeId: savedPlaces[0]!.id}}, update: {}, create: {userId: scannerUser.id, placeId: savedPlaces[0]!.id}});

  const customerSeeds = [
    {email: 'sarra@barmej.app', firstName: 'Sarra', lastName: 'Ben Ali', mobile: '20111222'},
    {email: 'youssef@barmej.app', firstName: 'Youssef', lastName: 'Trabelsi', mobile: '22123499'},
    {email: 'ines@barmej.app', firstName: 'Inès', lastName: 'Gharbi', mobile: '53123456'},
    {email: 'malek@barmej.app', firstName: 'Malek', lastName: 'Jaziri', mobile: '98111222'},
    {email: 'eya@barmej.app', firstName: 'Eya', lastName: 'Mansour', mobile: '27123456'},
  ];
  const customers = [demoUser];
  for (const customer of customerSeeds) {
    customers.push(await prisma.user.upsert({
      where: {email: customer.email},
      update: customer,
      create: {...customer, passwordHash: await bcrypt.hash('Client123!', 12), dietaryPreferences: ['Sans porc'], favoriteAmbiences: ['Calme', 'Romantique'], preferredBudget: 60},
    }));
  }

  // Plusieurs paliers fidélité pour tester le catalogue, le solde et les QR de récompense.
  const loyaltyCatalogs = [
    {place: savedPlaces[0]!, pointsPerVisit: 25, rewards: [
      {name: 'Café ou thé offert', description: 'À utiliser après votre repas.', pointsCost: 100},
      {name: 'Dessert signature offert', description: 'Au choix dans la carte des desserts.', pointsCost: 250},
      {name: '-20% sur l’addition', description: 'Hors événements spéciaux.', pointsCost: 500},
      {name: 'Dîner VIP pour deux', description: 'Menu dégustation réservé aux membres.', pointsCost: 1000, stock: 10},
    ]},
    {place: savedPlaces[5]!, pointsPerVisit: 15, rewards: [
      {name: 'Boisson chaude offerte', description: 'Café, thé ou chocolat chaud.', pointsCost: 100},
      {name: 'Brunch offert', description: 'Formule brunch complète.', pointsCost: 500, stock: 20},
    ]},
    {place: savedPlaces[3]!, pointsPerVisit: 30, rewards: [
      {name: 'Cocktail sans alcool offert', description: 'À savourer face à la mer.', pointsCost: 150},
      {name: 'Table vue mer prioritaire', description: 'Selon conditions météo.', pointsCost: 700, stock: 8},
    ]},
  ];
  for (const catalog of loyaltyCatalogs) {
    const program = await prisma.loyaltyProgram.upsert({where: {placeId: catalog.place.id}, update: {enabled: true, pointsPerVisit: catalog.pointsPerVisit}, create: {placeId: catalog.place.id, enabled: true, pointsPerVisit: catalog.pointsPerVisit}});
    for (const rewardData of catalog.rewards) {
      const existingReward = await prisma.loyaltyReward.findFirst({where: {programId: program.id, name: rewardData.name}});
      const data = {...rewardData, programId: program.id, placeId: catalog.place.id, active: true};
      if (existingReward) await prisma.loyaltyReward.update({where: {id: existingReward.id}, data});
      else await prisma.loyaltyReward.create({data});
    }
    await prisma.loyaltyAccount.upsert({where: {userId_placeId: {userId: demoUser.id, placeId: catalog.place.id}}, update: {balance: catalog.place.id === savedPlaces[0]!.id ? 620 : 180, lifetimePoints: catalog.place.id === savedPlaces[0]!.id ? 1120 : 330}, create: {userId: demoUser.id, placeId: catalog.place.id, balance: catalog.place.id === savedPlaces[0]!.id ? 620 : 180, lifetimePoints: catalog.place.id === savedPlaces[0]!.id ? 1120 : 330}});
  }

  for (const place of savedPlaces) {
    const [openTime, closeTime] = (place.schedule ?? '10:00 - 18:00').replace(/\s/g, '').split('-');
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const isClosed = (place.categoryId === 1 && weekday === 1) || (place.categoryId === 3 && weekday === 2);
      await prisma.placeOpeningHour.upsert({
        where: {placeId_weekday: {placeId: place.id, weekday}},
        update: {openTime, closeTime, isClosed},
        create: {placeId: place.id, weekday, openTime, closeTime, isClosed},
      });
    }
  }

  // Une fermeture exceptionnelle et deux exceptions de créneau pour tester le planning Pro.
  await prisma.placeClosure.upsert({
    where: {placeId_date: {placeId: savedPlaces[0]!.id, date: dateAt(6)}},
    update: {reason: 'Privatisation exceptionnelle'},
    create: {placeId: savedPlaces[0]!.id, date: dateAt(6), reason: 'Privatisation exceptionnelle'},
  });
  await prisma.placeSlotOverride.upsert({
    where: {placeId_date_time: {placeId: savedPlaces[0]!.id, date: dateAt(2), time: '20:00'}},
    update: {capacity: 6, isClosed: false},
    create: {placeId: savedPlaces[0]!.id, date: dateAt(2), time: '20:00', capacity: 6},
  });
  await prisma.placeSlotOverride.upsert({
    where: {placeId_date_time: {placeId: savedPlaces[0]!.id, date: dateAt(3), time: '21:00'}},
    update: {capacity: 0, isClosed: true},
    create: {placeId: savedPlaces[0]!.id, date: dateAt(3), time: '21:00', capacity: 0, isClosed: true},
  });

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


  const proReservationSeeds = [
    {user: customers[1]!, day: 0, time: '12:30', persons: 2, status: ReservationStatus.CONFIRMED, occasion: 'Déjeuner'},
    {user: customers[2]!, day: 0, time: '19:00', persons: 4, status: ReservationStatus.PENDING, occasion: 'Anniversaire'},
    {user: customers[3]!, day: 1, time: '20:00', persons: 2, status: ReservationStatus.PROPOSED, proposedDay: 1, proposedTime: '20:30', occasion: 'Rendez-vous'},
    {user: customers[4]!, day: 1, time: '21:00', persons: 6, status: ReservationStatus.CONFIRMED, occasion: 'Dîner en famille'},
    {user: customers[5]!, day: 2, time: '20:00', persons: 6, status: ReservationStatus.CONFIRMED, occasion: 'Entre amis'},
    {user: customers[1]!, day: 3, time: '18:30', persons: 3, status: ReservationStatus.PENDING, occasion: 'Afterwork'},
    {user: customers[2]!, day: -2, time: '20:00', persons: 2, status: ReservationStatus.COMPLETED, occasion: 'Dîner'},
    {user: customers[3]!, day: -3, time: '19:30', persons: 4, status: ReservationStatus.NO_SHOW, occasion: 'Entre amis'},
    {user: customers[4]!, day: -4, time: '21:00', persons: 2, status: ReservationStatus.DECLINED, occasion: 'Rendez-vous'},
    {user: customers[5]!, day: -5, time: '20:30', persons: 5, status: ReservationStatus.CANCELLED, occasion: 'Anniversaire'},
  ];
  const createdProReservations: any[] = [];
  for (const seed of proReservationSeeds) {
    const reservationDate = dateAt(seed.day);
    const existing = await prisma.reservation.findFirst({where: {userId: seed.user.id, placeId: savedPlaces[0]!.id, reservationDate, reservationTime: seed.time}});
    const data = {
      userId: seed.user.id,
      placeId: savedPlaces[0]!.id,
      reservationDate,
      reservationTime: seed.time,
      numberOfPersons: seed.persons,
      status: seed.status,
      occasion: seed.occasion,
      seatingPreference: seed.persons > 3 ? 'Intérieur' : 'Terrasse',
      allergies: seed.user.email === 'ines@barmej.app' ? ['Fruits à coque'] : [],
      message: seed.status === ReservationStatus.PENDING ? 'Table calme si possible' : null,
      proposedDate: seed.status === ReservationStatus.PROPOSED ? dateAt(seed.proposedDay) : null,
      proposedTime: seed.status === ReservationStatus.PROPOSED ? seed.proposedTime : null,
      proposalMessage: seed.status === ReservationStatus.PROPOSED ? 'Le créneau de 20h est complet. Nous vous proposons 20h30.' : null,
      cancellationReason: seed.status === ReservationStatus.CANCELLED ? 'Changement de programme' : null,
    };
    createdProReservations.push(existing ? await prisma.reservation.update({where: {id: existing.id}, data}) : await prisma.reservation.create({data}));
  }

  const completed = createdProReservations.find(row => row.status === ReservationStatus.COMPLETED);
  if (completed) {
    await prisma.review.upsert({
      where: {reservationId: completed.id},
      update: {cuisineRating: 5, serviceRating: 4, ambianceRating: 5, priceRating: 4, comment: 'Très belle expérience, service attentionné et cadre agréable.', photos: [image('photo-1547592180-85f173990554')], establishmentResponse: 'Merci pour votre visite, au plaisir de vous revoir !', respondedAt: new Date()},
      create: {reservationId: completed.id, userId: completed.userId, placeId: completed.placeId, cuisineRating: 5, serviceRating: 4, ambianceRating: 5, priceRating: 4, comment: 'Très belle expérience, service attentionné et cadre agréable.', photos: [image('photo-1547592180-85f173990554')], establishmentResponse: 'Merci pour votre visite, au plaisir de vous revoir !', respondedAt: new Date()},
    });
  }

  for (const [index, customer] of customers.slice(1, 4).entries()) {
    const reservationDate = dateAt(2);
    const reservationTime = '20:00';
    await prisma.waitlistEntry.upsert({
      where: {userId_placeId_reservationDate_reservationTime: {userId: customer.id, placeId: savedPlaces[0]!.id, reservationDate, reservationTime}},
      update: {numberOfPersons: index + 2, status: index === 0 ? WaitlistStatus.OFFERED : WaitlistStatus.WAITING, offerExpiresAt: index === 0 ? new Date(Date.now() + 15 * 60 * 1000) : null},
      create: {userId: customer.id, placeId: savedPlaces[0]!.id, reservationDate, reservationTime, numberOfPersons: index + 2, status: index === 0 ? WaitlistStatus.OFFERED : WaitlistStatus.WAITING, offerExpiresAt: index === 0 ? new Date(Date.now() + 15 * 60 * 1000) : null},
    });
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
  .then(() => console.log('Données Barmej et Barmej Pro ajoutées. Comptes: pro@barmej.app / Pro12345! ; clients / Client123!'))
  .finally(() => prisma.$disconnect());

