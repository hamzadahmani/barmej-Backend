/*
 * Ajoute les photos, vidéos et menus d'un dossier à un établissement Barmej (Cloudinary + base).
 *
 *   node scripts/add-place-media.cjs "<nom de l'établissement>" <dossier>
 *
 * Dans le dossier :
 *   01-xxx.jpg, 02-xxx.mp4 …  → photos et vidéos, dans cet ordre ; la première photo devient la couverture.
 *   menu-xxx.jpg + menu-xxx.json → menu photo validé (le .json liste les plats : name, priceMillimes, kind).
 *   les autres fichiers (promo-…) sont ignorés.
 * Relancer le script est sans risque : un fichier déjà importé est mis à jour, pas dupliqué.
 * Utilise DATABASE_URL et CLOUDINARY_* du fichier .env.
 */
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const {PrismaClient} = require('@prisma/client');
const {v2: cloudinary} = require('cloudinary');

const [placeName, folder] = process.argv.slice(2);
if (!placeName || !folder || !fs.existsSync(folder)) {
  console.error('Usage : node scripts/add-place-media.cjs "<nom de l\'établissement>" <dossier>');
  process.exit(1);
}
for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
  if (!process.env[key]) {
    console.error(`${key} manquant dans .env`);
    process.exit(1);
  }
}
cloudinary.config({cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true});

const IMAGE = /\.(jpe?g|png|webp)$/i;
const VIDEO = /\.(mp4|mov)$/i;
const prisma = new PrismaClient();

(async () => {
  const places = await prisma.place.findMany({where: {name: {equals: placeName, mode: 'insensitive'}}});
  if (places.length !== 1) throw new Error(places.length ? `Plusieurs établissements nommés « ${placeName} ».` : `Aucun établissement nommé « ${placeName} ». Lancez d'abord le seed ou créez-le dans le backoffice.`);
  const place = places[0];
  const base = `barmej/places/${place.id}`;
  const files = fs.readdirSync(folder).sort();

  const media = files.filter(f => /^\d+/.test(f) && (IMAGE.test(f) || VIDEO.test(f)));
  let coverSet = false;
  for (const [index, file] of media.entries()) {
    const video = VIDEO.test(file);
    const publicId = `${base}/${path.parse(file).name}`;
    const result = await cloudinary.uploader.upload(path.join(folder, file), {public_id: publicId, overwrite: true, resource_type: video ? 'video' : 'image'});
    const cover = !video && !coverSet;
    if (cover) {
      await prisma.placeMedia.updateMany({where: {placeId: place.id, type: 'COVER', publicId: {not: result.public_id}}, data: {type: 'GALLERY'}});
      await prisma.place.update({where: {id: place.id}, data: {image: result.secure_url}});
      coverSet = true;
    }
    const data = {
      placeId: place.id, secureUrl: result.secure_url, type: video ? 'VIDEO' : cover ? 'COVER' : 'GALLERY',
      width: result.width ?? null, height: result.height ?? null, bytes: result.bytes ?? null, format: result.format ?? null,
      duration: result.duration ?? null, active: true, moderationStatus: 'APPROVED', sortOrder: index,
    };
    await prisma.placeMedia.upsert({where: {publicId: result.public_id}, update: data, create: {...data, publicId: result.public_id}});
    console.log(`✓ ${file} → ${data.type}`);
  }

  for (const file of files.filter(f => /^menu-/i.test(f) && IMAGE.test(f))) {
    const itemsFile = path.join(folder, `${path.parse(file).name}.json`);
    if (!fs.existsSync(itemsFile)) {
      console.log(`… ${file} ignoré : ajoutez ${path.basename(itemsFile)} avec la liste des plats.`);
      continue;
    }
    const items = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
    const result = await cloudinary.uploader.upload(path.join(folder, file), {public_id: `${base}/menus/${path.parse(file).name}`, overwrite: true, resource_type: 'image'});
    const data = {placeId: place.id, imageUrl: result.secure_url, items, draftItems: items, active: true, validatedAt: new Date()};
    await prisma.placeMenu.upsert({where: {publicId: result.public_id}, update: data, create: {...data, publicId: result.public_id}});
    console.log(`✓ ${file} → menu validé (${items.length} plats)`);
  }

  const ignored = files.filter(f => !/^\d+/.test(f) && !/^menu-/i.test(f));
  if (ignored.length) console.log(`Ignorés : ${ignored.join(', ')}`);
  console.log(`Terminé pour ${place.name} (#${place.id}).`);
})()
  .catch(error => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
