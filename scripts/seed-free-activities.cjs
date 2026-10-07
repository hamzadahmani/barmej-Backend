require('dotenv').config();
const {PrismaClient} = require('@prisma/client');

// Deliberately separate from the general seed: never populate a remote database.
const host = new URL(process.env.DATABASE_URL).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  throw new Error('Ce jeu de démonstration est réservé à PostgreSQL local.');
}
const prisma = new PrismaClient();
const activities = [
  {name: '[Démo] Promenade à La Marsa', latitude: 36.883, longitude: 10.334, durationMin: 45},
  {name: '[Démo] Balade à Sidi Bou Saïd', latitude: 36.871, longitude: 10.347, durationMin: 60},
  {name: '[Démo] Pause au bord de mer', latitude: 36.889, longitude: 10.329, durationMin: 30},
];
async function main() {
  await prisma.$transaction(async tx => {
    const category = await tx.category.findFirst({where: {name: 'Sorties'}});
    if (!category) throw new Error('Initialisez d’abord la catégorie Sorties dans la base locale.');
    for (const activity of activities) {
      const description = 'Donnée de test uniquement. Accès gratuit simulé, coordonnées et horaires indicatifs non vérifiés. Transport, stationnement et consommations non inclus.';
      const data = {
        name: activity.name, categoryId: category.id, latitude: activity.latitude, longitude: activity.longitude,
        address: 'La Marsa / Sidi Bou Saïd — lieu de démonstration', subtitle: 'Balade gratuite · Démonstration', description,
        averagePrice: 0, capacityPerSlot: 0, verified: false, reviewsEnabled: false,
        environment: 'OUTDOOR', weatherSensitive: true, defaultDurationMin: activity.durationMin,
        suitabilityMoods: ['romantique', 'calme', 'decouverte', 'familial'], groupTypes: ['couple', 'amis', 'famille', 'solo'],
        schedule: '08:00 - 22:00',
      };
      const existing = await tx.place.findFirst({where: {name: activity.name}});
      const place = existing ? await tx.place.update({where: {id: existing.id}, data}) : await tx.place.create({data});
      await tx.placeCategory.upsert({where: {placeId_categoryId: {placeId: place.id, categoryId: category.id}}, update: {}, create: {placeId: place.id, categoryId: category.id}});
      for (let weekday = 0; weekday < 7; weekday++) {
        await tx.placeOpeningHour.upsert({where: {placeId_weekday: {placeId: place.id, weekday}}, update: {openTime: '08:00', closeTime: '22:00', isClosed: false}, create: {placeId: place.id, weekday, openTime: '08:00', closeTime: '22:00', isClosed: false}});
      }
      const experience = {placeId: place.id, name: activity.name, description, category: 'activity', price: 0, durationMin: activity.durationMin, active: true, environment: 'OUTDOOR', weatherSensitive: true, maxWindKph: 35, suitabilityMoods: data.suitabilityMoods, groupTypes: data.groupTypes, keywords: ['démo', 'gratuit', 'balade']};
      const found = await tx.experience.findFirst({where: {placeId: place.id, name: activity.name}});
      if (found) await tx.experience.update({where: {id: found.id}, data: experience});
      else await tx.experience.create({data: experience});
    }
  }, {timeout: 30000});
  const rows = await prisma.experience.findMany({where: {name: {in: activities.map(item => item.name)}, price: 0, active: true}, select: {name: true, price: true, environment: true}});
  console.log(JSON.stringify(rows, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
