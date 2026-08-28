# Backend Barmej

API séparée Node.js + TypeScript + Express + PostgreSQL, compatible avec les endpoints actuellement utilisés par l'application React Native Barmej.

## Fonctionnalités

- inscription, connexion par email et connexion externe Google ;
- JWT et mots de passe hachés avec bcrypt ;
- profil utilisateur et suppression du compte ;
- catégories, lieux, recherche et proximité géographique ;
- favoris ;
- réservations ;
- calendrier quotidien et hebdomadaire Barmej Pro ;
- indicateur de risque d’absence basé sur l’historique réel du client ;
- statistiques de fréquentation, récurrence, créneaux et jours forts ;
- journal d’audit des actions réalisées par l’équipe ;
- programme de fidélité configurable, attribution automatique des points et utilisation sécurisée des récompenses ;
- score public de complétude sur 100 avec recommandations prioritaires pour le gérant ;
- disponibilités réelles par établissement (horaires hebdomadaires, jours fermés, capacité et exceptions par créneau) ;
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

### Comptes Barmej Pro de démonstration

- établissement : `pro@barmej.app` / `Pro12345!` ;
- portier (scanner uniquement) : `scanner.patio@barmej.app` / `Scanner123!` ;
- clients : `sarra@barmej.app`, `youssef@barmej.app`, `ines@barmej.app`, `malek@barmej.app`, `eya@barmej.app` ;
- mot de passe commun des clients : `Client123!`.

Le seed crée pour **Le Patio** des réservations dans tous les statuts, une proposition d’horaire, une fermeture exceptionnelle, des capacités personnalisées, un créneau fermé, une liste d’attente, un avis vérifié avec réponse et des notifications.

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
| GET | `/places/:placeId/availability?date=YYYY-MM-DD&guests=2` | JWT |
| GET/PUT | `/admin/places/:placeId/availability-settings`, `/admin/places/:placeId/opening-hours` | Admin |
| POST/DELETE | `/admin/places/:placeId/closures` | Admin |
| PUT | `/admin/places/:placeId/slot-overrides` | Admin |
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

## Photos des établissements avec Cloudinary

Les photos sont envoyées directement depuis Barmej Pro vers Cloudinary avec une signature temporaire créée par le backend. La clé secrète Cloudinary reste exclusivement côté serveur. PostgreSQL conserve seulement les métadonnées (`publicId`, URL sécurisée, dimensions et ordre), jamais le fichier image.

1. Dans le tableau de bord Cloudinary, ouvrir **API Keys**.
2. Ajouter ces variables dans `.env` pour le développement local :

```env
CLOUDINARY_CLOUD_NAME=nom_du_cloud
CLOUDINARY_API_KEY=cle_api
CLOUDINARY_API_SECRET=secret_api
```

3. Ajouter les mêmes variables secrètes dans **Render > Environment** puis redéployer le backend.
4. Appliquer la migration qui crée la galerie :

```bash
npm run db:deploy
```

Barmej Pro accepte jusqu’à 5 images par établissement, couverture comprise (JPG, PNG, WebP ou HEIC, 8 Mo maximum), ainsi qu’une vidéo de présentation MP4 ou MOV de 60 secondes et 50 Mo maximum. Définir une photo comme couverture met également à jour l'image principale visible dans Barmej.
