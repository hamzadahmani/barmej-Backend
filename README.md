# Backend Barmej

API séparée Node.js + TypeScript + Express + PostgreSQL, compatible avec les endpoints actuellement utilisés par l'application React Native Barmej.

## Fonctionnalités

- inscription, connexion par email et connexion externe Google ;
- JWT et mots de passe hachés avec bcrypt ;
- profil utilisateur et suppression du compte ;
- catégories, lieux, recherche et proximité géographique ;
- favoris ;
- réservations ;
- signalements ;
- jetons appareil et notifications ;
- validation Zod, Helmet, CORS et erreurs structurées ;
- Prisma, PostgreSQL, migration et données de démonstration.

## Démarrage local

Prérequis : Node.js 20+, npm, Docker Desktop.

```bash
docker compose up -d postgres
copy .env.example .env
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

L'API écoute sur `http://localhost:8090`. Le compte de démonstration est `demo@barmej.app` / `Demo123!`.

## Câblage avec Barmej

Le client Axios de Barmej est configuré automatiquement en développement :

- Android Emulator : `http://10.0.2.2:8090`
- iOS Simulator : `http://localhost:8090`

Le manifeste Android `debug` autorise déjà le HTTP local et iOS autorise déjà le réseau local. Pour un téléphone Android/iPhone réel, remplacez l'hôte de développement dans `src/services/request.tsx` par l'adresse IPv4 locale de la machine, par exemple `http://192.168.1.20:8090`.

Depuis un émulateur Android, utiliser `http://10.0.2.2:8090`. Depuis iOS Simulator, utiliser `http://localhost:8090`. Sur un téléphone réel, utiliser l'adresse IP locale de la machine, puis HTTPS en production.

## Vérification

```bash
npm run typecheck
npm test
npm run build
```

## Routes compatibles avec l'application

| Méthode | Route | Auth |
|---|---|---|
| POST | `/signup` | Non |
| POST | `/authenticate` | Non |
| POST | `/auth-external` | Non |
| GET | `/getAllCategories` | Non |
| GET | `/getPlaceByCategory/:id` | Non |
| GET | `/getPlaceInfoByIdPlace/:id` | Non |
| GET | `/getNearMe` | Non |
| GET | `/search?query=...` | Non |
| GET/PUT | `/getUserById`, `/updateUser` | JWT |
| POST | `/setToken`, `/deleteUser` | JWT |
| GET/POST/DELETE | favoris | JWT |
| GET/POST/PUT | réservations | JWT |
| POST | `/addReport` | JWT |
| GET/PATCH | `/notifications` | JWT |

Les routes protégées attendent `Authorization: Bearer <token>`.

## Production

- définir un `JWT_SECRET` aléatoire d'au moins 32 caractères ;
- utiliser une URL PostgreSQL avec un compte dédié et TLS ;
- placer l'API derrière un proxy HTTPS (Caddy, Nginx ou plateforme cloud) ;
- définir précisément `CORS_ORIGIN` ;
- exécuter `npm run db:deploy` au déploiement ;
- ne jamais committer `.env`.
