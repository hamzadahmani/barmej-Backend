/*
 * Crée un compte administrateur Barmej, ou donne le rôle ADMIN à un compte existant.
 *   node scripts/make-admin.cjs <email> [motDePasse] [prénom]
 * - Le compte existe : il passe ADMIN (et le mot de passe est changé s'il est fourni).
 * - Il n'existe pas : il est créé (mot de passe obligatoire, 8 caractères minimum).
 * Utilise la base de DATABASE_URL (fichier .env ou variable d'environnement).
 */
require('dotenv/config');
const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcryptjs');

const [rawEmail, password, firstName = 'Admin'] = process.argv.slice(2);
const email = (rawEmail || '').toLowerCase().trim();
if (!email || !email.includes('@')) {
  console.error('Usage : node scripts/make-admin.cjs <email> [motDePasse] [prénom]');
  process.exit(1);
}
if (password && password.length < 8) {
  console.error('Le mot de passe doit contenir au moins 8 caractères.');
  process.exit(1);
}

const prisma = new PrismaClient();
(async () => {
  const existing = await prisma.user.findUnique({where: {email}});
  if (!existing && !password) {
    console.error(`Aucun compte avec l’e-mail ${email}. Ajoutez un mot de passe pour le créer :\n  node scripts/make-admin.cjs ${email} <motDePasse>`);
    process.exitCode = 1;
    return;
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  const user = existing
    ? await prisma.user.update({where: {email}, data: {role: 'ADMIN', ...(passwordHash ? {passwordHash} : {})}})
    : await prisma.user.create({data: {email, passwordHash, firstName, lastName: 'Barmej', role: 'ADMIN'}});
  console.log(`${existing ? 'Compte mis à jour' : 'Compte créé'} : ${user.email} est administrateur.`);
})()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
