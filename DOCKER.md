# AerisPay — Conteneurisation (Docker & Docker Compose)

L’infrastructure cible repose sur **deux configurations Compose distinctes** : une pour le **développement local** (données faciles, outils d’admin) et une pour la **production** (application buildée + base de données persistante).

Les fichiers Compose, le `Dockerfile` et `package.json` de l’application sont dans le dossier **`web/`** à la racine du dépôt (voir aussi `TODO.md`).

| Fichier | Usage |
|--------|--------|
| `web/docker-compose.yml` | **Développement** : MySQL 8.4 + phpMyAdmin + service **`app`** (Next.js en `npm run dev` dans le conteneur, code monté depuis `web/`). |
| `web/docker-compose.prod.yml` | **Production** : build de l’image + MySQL, réseau et volumes nommés. |
| `web/Dockerfile` | Image de production Next.js (mode `standalone`). |
| `web/development.env.example` / `web/production.env.example` | Exemples de variables (copie vers `.env.local` ou fichier d’environnement non versionné). |

## Prérequis côté application (build image)

- Fichier `web/package.json` (projet Next.js initialisé).
- Dans `web/next.config.js` ou `web/next.config.mjs` : `output: "standalone"` (requis par le `Dockerfile`).
- Schéma Prisma : `datasource db { provider = "mysql" }` et `DATABASE_URL` au format `mysql://...` (voir `ARCHITECTURE_MVP.md`). La phase **builder** exécute `npx prisma generate` avant `npm run build` (tout depuis `web/`).

## Développement local

1. Configurer les variables. **Important :** lancer `docker compose` **depuis `web/`** (recommandé) afin que le conteneur `app` voie le bon `package.json` (montage du code vers `/app`).

   ```bash
   cp web/development.env.example web/.env
   # éditer web/.env (NEXTAUTH_SECRET, etc.)
   cd web
   docker compose up -d
   ```

   Si vous devez lancer `docker compose -f web/docker-compose.yml` **depuis la racine du dépôt** (sans `cd web`), le montage pointe sur le mauvais dossier sauf surchargé : créez un `.env` **à la racine** avec `APP_BIND=web` (voir `web/development.env.example`).

2. Démarrer toute la stack (base + phpMyAdmin + app) — de préférence :

   ```bash
   cd web
   docker compose up -d
   ```

   - **App** : <http://localhost:3000> (ou `APP_PORT` dans `.env`) — le compose définit `DATABASE_URL` vers le service `db` ; `node_modules` est stocké dans un volume nommé `aerispay_app_node_modules_dev` (évite conflit hôte/ Linux).

3. Migrations (premier lancement, ou depuis l’hôte) :

   ```bash
   cd web
   docker compose exec app npx prisma migrate dev
   ```

4. **phpMyAdmin** : <http://localhost:8080> (sauf si `PHPMYADMIN_PORT` a été modifié). Serveur : `db`, utilisateur / mot de passe : `MYSQL_USER` / `MYSQL_PASSWORD` (ou `root` / `MYSQL_ROOT_PASSWORD`).

5. **Option** : ne pas utiliser le service `app` et lancer Next **sur l’hôte** — exécuter seulement `db` + `phpmyadmin` n’est pas le fichier par défaut (vous pouvez retirer le service `app` ou utiliser [profiles](https://docs.docker.com/compose/profiles/)). Sinon : `docker compose up -d` puis `npx prisma migrate dev` + `npm run dev` en local, avec `DATABASE_URL=...localhost:3306` dans `web/.env.local`.

6. Arrêt des services :

   ```bash
   cd web
   docker compose down
   ```

   Données MySQL : volume `aerispay_mysql_data_dev`. Dépendances Node : volume `aerispay_app_node_modules_dev` (conservé entre les redémarrages).

## Production

1. Copier l’exemple d’environnement et le renseigner (mots de passe, `NEXTAUTH_URL` publique, `NEXTAUTH_SECRET`) :

   ```bash
   cp web/production.env.example web/production.env
   # éditer web/production.env
   ```

   Important : `DATABASE_URL` doit utiliser le **hostname du service Compose** `db` (et non `localhost`), car l’app tourne dans le même réseau Docker que MySQL, sur le port **3306**.

2. Build et démarrage (depuis la racine du dépôt ou en étant dans `web/`) :

   ```bash
   cd web
   docker compose -f docker-compose.prod.yml --env-file production.env up -d --build
   ```

3. **Migrations** (à automatiser en CI ou à lancer après déploiement) : utiliser le même `DATABASE_URL` qu’en production.

   ```bash
   cd web
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
| `app` | Oui (`node` + `npm run dev` monté) | Oui (image `web/Dockerfile`) | Next.js |

En **prod** l’image est buildée par le `Dockerfile`. En **dev** le conteneur `app` installe les deps (`npm install`), exécute `npx prisma generate` puis `next dev` sur `0.0.0.0:3000`.

## Dépannage (service `app`)

- **`package.json` introuvable dans `/app` (npm ENOENT)** : vous n’utilisez pas le bon répertoire comme racine de montage. Faire **`cd web`** puis `docker compose up`, ou définir **`APP_BIND=web`** dans le `.env` du répertoire d’où part la commande. Vérifier aussi qu’un `package.json` existe (projet initialisé avec `create-next-app` dans `web/`).

## Fichiers de référence

- `web/.dockerignore` : réduit le contexte d’image (exclut `node_modules`, secrets, etc.).
- Noms de volumes : `aerispay_mysql_data_dev` / `aerispay_mysql_data_prod` pour ne pas mélanger les jeux de données.
