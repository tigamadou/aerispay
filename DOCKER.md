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
- Démarche **TDD** : avant d’ajouter une fonctionnalité qui dépend de Docker, de la base ou d’un service, écrire les tests ou contrôles automatisés qui valident le comportement attendu.

## Périphériques de caisse

- **Imprimante ticket** : privilégier une imprimante ESC/POS réseau (`tcp://IP:9100`) pour les environnements Docker. C’est le mode le plus portable entre macOS, Linux et production.
- **Douchette code-barres** : les lecteurs USB/HID en mode clavier fonctionnent côté navigateur sans accès spécial au conteneur. Le POS doit traiter le scan comme une saisie clavier rapide terminée par `Enter`.
- **Tiroir-caisse** : mode recommandé via l’imprimante ticket (port RJ11/RJ12) avec impulsion ESC/POS. Un tiroir USB/série direct nécessite d’exposer le device au conteneur et n’est pas portable sur Docker Desktop macOS.
- **USB / série dans Docker** : éviter en développement macOS si possible ; utiliser une imprimante réseau ou lancer l’intégration matérielle sur l’hôte lorsque l’accès device est requis.
- Détails d’ordre d’appel API, mocks TDD et alignement des routes : **`SPECS/PERIPHERIQUES.md`**.

En **déploiement multi-supermarchés** (même groupe, plusieurs sites), l’objectif usuel est **une stack Compose (ou VM) par magasin**, chacun avec sa **propre** base MySQL locale sur le LAN — sauvegarde en ligne et accès distants : **`SPECS/MULTI_ORGANISATION.md`**.

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

   Les fonctionnalités développées dans ce conteneur suivent le même cycle TDD que l’hôte : tests d’abord, implémentation ensuite, puis validation avec `npm run test` / `npm run test:e2e` selon le périmètre.

3. Migrations (premier lancement, ou depuis l’hôte) :

   ```bash
   docker compose exec app npx prisma migrate dev
   ```

4. **phpMyAdmin** : ouvrir l’URL de l’UI (souvent **`http://localhost:8080/`** si le port est exposé, ou l’hôte Traefik du compose — la **racine** seule, pas `/dashboard`). En **développement**, le compose configure **`PMA_USER=root`** et **`PMA_PASSWORD=${MYSQL_ROOT_PASSWORD}`** : le mot de passe **root** MySQL vaut par défaut **`root`** (définir `MYSQL_ROOT_PASSWORD` dans le `.env` pour le changer). Compte applicatif classique : `MYSQL_USER` / `MYSQL_PASSWORD` (souvent `aerispay` / `aerispay`). **Ne pas** réutiliser `root` / `root` hors dev.

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

## Application Next.js dans le conteneur `app`

- **Base de données** : dans le conteneur, `DATABASE_URL` pointe vers l’hôte **`db`** (port `3306` interne), **pas** vers `localhost` (qui serait le conteneur lui-même). Ne pas surcharger `DATABASE_URL` dans `web/app/.env` avec `localhost` si l’app tourne **dans** Docker.
- **NextAuth** : `NEXTAUTH_URL` doit rester l’URL **publique** telle que le navigateur l’utilise (ex. `http://localhost:3000` ou l’IP de la machine). Le compose duplique `NEXTAUTH_SECRET` vers `AUTH_SECRET` pour NextAuth v5.
- **Première initialisation Prisma** (schéma prêt, conteneur `app` actif) :

  ```bash
  docker compose exec app npx prisma migrate dev --name init
  docker compose exec app npx prisma db seed
  ```

  Puis recharger l’app si besoin. Les commandes s’exécutent **dans** `/app` (projet monté depuis `web/app`).

## Dépannage (service `app`)

- **`package.json` introuvable dans `/app` (npm ENOENT)** : le montage du service `app` ne pointe pas vers le projet Next.js. Avec le compose racine, le défaut est `APP_BIND=./web/app`. Vérifier que `web/app/package.json` existe ou corriger `APP_BIND` dans le `.env` racine.
- **Prisma : connexion refusée à `localhost:3306` depuis l’`app` Docker** : `DATABASE_URL` ne doit **pas** cibler `localhost` conteneur ; utiliser le service `db` (défaut imposé par le compose) ou lancer l’app sur l’hôte avec `localhost` dans `web/app/.env.local` uniquement.
- **NextAuth : erreur de session / `Unexpected error`** : vérifier `NEXTAUTH_URL`, `AUTH_SECRET` / `NEXTAUTH_SECRET` identiques à ce que le navigateur et le serveur attendent.
- **phpMyAdmin : page 404 ou « Not Found »** : l’UI est sur **`http://localhost:PORT/`** (souvent [http://localhost:8080](http://localhost:8080)) et **non** `http://localhost:8080/dashboard/`. Vérifier avec `docker compose ps` que le service `phpmyadmin` est `Up` et le port mappé (`0.0.0.0:8080->80/tcp`). Si le port est déjà pris, changer `PHPMYADMIN_PORT` dans le `.env` et relancer.
- **Changement de `MYSQL_ROOT_PASSWORD` sans effet** : le mot de passe root est fixé **à la création** du volume MySQL. Pour repartir sur le défaut `root` / `root`, supprimer le volume nommé (ex. `aerispay_mysql_data_dev`) et relancer (données effacées).

- **Prisma P3014 / P3004 / « shadow database »** : `prisma migrate dev` utilise une **shadow** ; l’utilisateur de `DATABASE_URL` n’a en général pas `CREATE DATABASE` (P3014) — le compose fournit `SHADOW_DATABASE_URL` avec **`root`**, pointant sur **`db:3306/…`** avec le **même nom de base** que l’app (`/aerispay`). L’URL shadow **ne doit pas** se terminer sans nom de base : le client MySQL se connecte alors souvent sur la base système **`mysql`**, d’où **P3004** (« the mysql database is a system database… »). **Hors Docker** : `SHADOW_DATABASE_URL=mysql://root:…@localhost:PORT/aerispay` dans `web/app/.env.local`. Recréer le conteneur `app` si besoin : `docker compose up -d --force-recreate app`. Alternative (proto seulement) : `npx prisma db push`.
- **Prisma : OpenSSL** (`libssl` …) : l’image `node:…-slim` n’a parfois pas OpenSSL requis par les binaires Prisma — si erreurs, installer dans un Dockerfile d’`app` : `apt-get update && apt-get install -y openssl` (voir avertissement Prisma au `migrate`).

## Fichiers de référence

- `web/Dockerfile` : construit l’image applicative depuis le contexte `web/app`.
- `web/app/.gitignore` : exclut les dépendances, builds, fichiers d’environnement et artefacts locaux du projet Next.js.
- Noms de volumes : `aerispay_mysql_data_dev` / `aerispay_mysql_data_prod` pour ne pas mélanger les jeux de données.
