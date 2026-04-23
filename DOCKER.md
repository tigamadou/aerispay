# AerisPay — Conteneurisation (Docker & Docker Compose)

L’infrastructure cible repose sur **deux configurations Compose distinctes** : une pour le **développement local** (données faciles, outils d’admin) et une pour la **production** (application buildée + base de données persistante).

| Fichier | Usage |
|--------|--------|
| `docker-compose.yml` | **Développement** : MySQL 8.4 + phpMyAdmin. L’app Next.js est en principe lancée sur l’hôte (`npm run dev`) pour le rechargement à chaud. |
| `docker-compose.prod.yml` | **Production** : build de l’image `Dockerfile` + MySQL, réseau et volumes nommés. |
| `Dockerfile` | Image de production Next.js (mode `standalone`). |
| `docker/env/*.env.example` | Exemples de variables (copie vers un fichier d’environnement non versionné). |

## Prérequis côté application (build image)

- Fichier `package.json` à la racine (projet Next.js initialisé).
- Dans `next.config.js` ou `next.config.mjs` : `output: "standalone"` (requis par le `Dockerfile`).
- Schéma Prisma : `datasource db { provider = "mysql" }` et `DATABASE_URL` au format `mysql://...` (voir `ARCHITECTURE_MVP.md`). La phase **builder** exécute `npx prisma generate` avant `npm run build`.

## Développement local

1. Démarrer la base (et phpMyAdmin) :

   ```bash
   docker compose up -d
   ```

2. Configurer l’environnement de l’app sur l’hôte, par exemple en reprenant `docker/env/development.env.example` dans `.env.local` (adapter `DATABASE_URL` si le port diffère, par défaut `3306`).

3. Lancer Prisma et l’application :

   ```bash
   npx prisma migrate dev
   npm run dev
   ```

4. **phpMyAdmin** : <http://localhost:8080> (sauf si `PHPMYADMIN_PORT` a été modifié). Serveur : `db`, utilisateur / mot de passe : voir `MYSQL_USER` / `MYSQL_PASSWORD` (ou `root` / `MYSQL_ROOT_PASSWORD`).

5. Arrêt des services :

   ```bash
   docker compose down
   ```

   Données MySQL : volume nommé `aerispay_mysql_data_dev` (conservé entre les `down` / `up`).

## Production

1. Copier l’exemple d’environnement et le renseigner (mots de passe, `NEXTAUTH_URL` publique, `NEXTAUTH_SECRET`) :

   ```bash
   cp docker/env/production.env.example docker/env/production.env
   # éditer docker/env/production.env
   ```

   Important : `DATABASE_URL` doit utiliser le **hostname du service Compose** `db` (et non `localhost`), car l’app tourne dans le même réseau Docker que MySQL, sur le port **3306**.

2. Build et démarrage :

   ```bash
   docker compose -f docker-compose.prod.yml --env-file docker/env/production.env up -d --build
   ```

3. **Migrations** (à automatiser en CI ou à lancer après déploiement) : utiliser le même `DATABASE_URL` qu’en production. Avec l’app déjà en image, on exécute en one-shot (nécessite le client Prisma dans l’image : ajouter un script côté projet si besoin) :

   ```bash
   docker compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy
   ```

   Variante : exécuter `prisma migrate deploy` depuis un pipeline qui a accès à la base, avant de router le trafic vers la nouvelle version.

4. L’application écoute le port mappé sur l’hôte, par défaut `3000` (variable `PORT` dans l’`env`).

5. Mise en reverse proxy (Traefik, Nginx, Caddy) et TLS : hors du périmètre des fichiers Compose, à configurer sur l’hôte ou sur l’orchestrateur (Kubernetes, etc.).

## Rôles des services

| Service | Fichier dev | Fichier prod | Rôle |
|--------|-------------|--------------|------|
| `db` | Oui | Oui | MySQL 8.4, volume persistant, healthcheck `mysqladmin ping` |
| `phpmyadmin` | Oui | Non | Interface web SQL (uniquement en dev) |
| `app` | Non* | Oui | Next.js (image `Dockerfile`) |

\*En dev, l’exécution de Next sur l’hôte est le flux recommandé. Pour tout exécuter en conteneur, il faudrait un service supplémentaire (montage de code, commande `npm run dev`) : non fourni ici afin d’éviter une image de dev lourde et frêle.

## Fichiers de référence

- `.dockerignore` : réduit le contexte d’image (exclut `node_modules`, secrets, etc.).
- Noms de volumes : `aerispay_mysql_data_dev` / `aerispay_mysql_data_prod` pour ne pas mélanger les jeux de données.
