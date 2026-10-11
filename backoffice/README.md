# Backoffice Barmej

Application web d’administration (React + Vite + TypeScript), réservée aux comptes **ADMIN**.
Elle utilise l’API `/admin/v1` du backend (fichier `src/admin.ts`).

## Modules

- **Tableau de bord** : tâches à traiter, chiffres clés, réservations et inscriptions sur 14 jours, formules.
- **Établissements** : recherche, création, modification complète de la fiche, catégories, vérification, gérants Barmej Pro.
- **Abonnements** : demandes de formule à activer ou refuser, changement de formule et de statut.
- **Utilisateurs** : recherche, filtre par rôle, changement de rôle.
- **Modération** : photos et vidéos (approuver, refuser, masquer), menus photo, signalements, avis.
- **Réservations** : toutes les tables et tous les séjours, filtres par statut et par date.
- **Campagnes** : couper ou réactiver une campagne sponsorisée.

## Démarrer en local

```bash
cd backoffice
cp .env.example .env        # VITE_API_URL=http://localhost:8091
npm install
npm run dev                  # http://localhost:5174
```

## Créer le premier administrateur

Le compte doit déjà exister (inscription depuis l’app Barmej). Depuis le dossier du backend :

```bash
node scripts/make-admin.cjs ton.email@exemple.com
```

En production, lance la même commande avec la `DATABASE_URL` de production (shell Render).

## Déployer sur Render (site statique)

- Root directory : `backoffice`
- Build command : `npm install && npm run build`
- Publish directory : `dist`
- Variable d’environnement : `VITE_API_URL=https://<ton-backend>.onrender.com`
- Côté backend, si `CORS_ORIGIN` n’est pas `*`, ajoute l’URL du backoffice.
