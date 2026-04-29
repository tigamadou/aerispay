# AerisPay — Conteneurisation (Docker & Docker Compose)

L’infrastructure cible repose sur **deux configurations Compose distinctes** : une pour le **développement local** (données faciles, outils d’admin) et une pour la **production** (application buildée + base de données persistante).

Les fichiers Compose sont maintenant à la **racine du dépôt**. Le `Dockerfile` et les exemples d’environnement restent sous **`web/`**, et le projet Next.js vit sous **`web/app/`** (voir aussi `TODO.md`).

| Fichier | Usage |
|--------|--------|
| `docker-compose.yml` | **Développement** : MySQL 8.4 + phpMyAdmin + service **`app`** (Next.js en `npm run dev` dans le conteneur, code monté depuis `web/app/`). |
| `docker-compose.prod.yml` | **Production** : build de l’image + MySQL, réseau et volumes nommés. |
| `web/Dockerfile` | Image de production Next.js (mode `standalone`). |
| `web/development.env.example` / `web/production.env.example` | Exemples de variables (copie vers `.env` à la racine, ou vers un fichier d’environnement non versionné passé avec `--env-file`). |

## Prérequis côté application (build image)

- Fichier `web/app/package.json` (projet Next.js initialisé).
- Dans `web/app/next.config.ts` : `output: "standalone"` (requis par le `Dockerfile` de production).
- Schéma Prisma : `datasource db { provider = "mysql" }` et `DATABASE_URL` au format `mysql://...` (voir `ARCHITECTURE_MVP.md`). La phase **builder** exécute `npx prisma generate` avant `npm run build` depuis le contexte `web/app/`.

## Développement local

1. Configurer les variables. Lancer `docker compose` depuis la **racine du dépôt** afin que le fichier `.env` racine soit chargé et que le montage par défaut `./web/app:/app` pointe vers le projet Next.js.

   ```bash
   cp web/development.env.example .env
   # éditer .env (NEXTAUTH_SECRET, ports, etc.)
   docker compose up -d
   ```

   Le chemin monté dans le conteneur `app` est configurable avec `APP_BIND` si le projet Next.js est déplacé. Par défaut : `APP_BIND=./web/app`.

2. Démarrer toute la stack (base + phpMyAdmin + app) — de préférence :

   ```bash
   docker compose up -d
   ```

   - **App** : <http://localhost:3000> (ou `APP_PORT` dans `.env`) — le compose définit `DATABASE_URL` vers le service `db` ; `node_modules` est stocké dans un volume nommé `aerispay_app_node_modules_dev` (évite conflit hôte/ Linux).

3. Migrations (premier lancement, ou depuis l’hôte) :

   ```bash
   docker compose exec app npx prisma migrate dev
   ```

4. **phpMyAdmin** : <http://localhost:8080> (sauf si `PHPMYADMIN_PORT` a été modifié). Serveur : `db`, utilisateur / mot de passe : `MYSQL_USER` / `MYSQL_PASSWORD` (ou `root` / `MYSQL_ROOT_PASSWORD`).

5. **Option** : ne pas utiliser le service `app` et lancer Next **sur l’hôte** — exécuter seulement `db` + `phpmyadmin` n’est pas le fichier par défaut (vous pouvez retirer le service `app` ou utiliser [profiles](https://docs.docker.com/compose/profiles/)). Sinon : `docker compose up -d` depuis la racine, puis `cd web/app && npx prisma migrate dev && npm run dev` en local, avec `DATABASE_URL=...localhost:3306` dans `web/app/.env.local`.

6. Arrêt des services :

   ```bash
   docker compose down
   ```

   Données MySQL : volume `aerispay_mysql_data_dev`. Dépendances Node : volume `aerispay_app_node_modules_dev` (conservé entre les redémarrages).

## Production

1. Copier l’exemple d’environnement et le renseigner (mots de passe, `NEXTAUTH_URL` publique, `NEXTAUTH_SECRET`) :

   ```bash
   cp web/production.env.example .env.production
   # éditer .env.production
   ```

   Important : `DATABASE_URL` doit utiliser le **hostname du service Compose** `db` (et non `localhost`), car l’app tourne dans le même réseau Docker que MySQL, sur le port **3306**.

2. Build et démarrage depuis la racine du dépôt :

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   ```

3. **Migrations** (à automatiser en CI ou à lancer après déploiement) : utiliser le même `DATABASE_URL` qu’en production.

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production run --rm app npx prisma migrate deploy
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

En **prod** l’image est buildée par `web/Dockerfile` avec le contexte `web/app`. En **dev** le conteneur `app` installe les deps (`npm install`), exécute `npx prisma generate` seulement si `prisma/schema.prisma` existe, puis `next dev` sur `0.0.0.0:3000`.

## Dépannage (service `app`)

- **`package.json` introuvable dans `/app` (npm ENOENT)** : le montage du service `app` ne pointe pas vers le projet Next.js. Avec le compose racine, le défaut est `APP_BIND=./web/app`. Vérifier que `web/app/package.json` existe ou corriger `APP_BIND` dans le `.env` racine.

## Fichiers de référence

- `web/Dockerfile` : construit l’image applicative depuis le contexte `web/app`.
- `web/app/.gitignore` : exclut les dépendances, builds, fichiers d’environnement et artefacts locaux du projet Next.js.
- Noms de volumes : `aerispay_mysql_data_dev` / `aerispay_mysql_data_prod` pour ne pas mélanger les jeux de données.
