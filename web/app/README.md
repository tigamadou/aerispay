# AerisPay (Next.js)

Application de caisse et de gestion — point d’entrée : `src/app/`, Prisma dans `prisma/`.

## Développement

### Avec Docker (recommandé)

À la **racine du dépôt** (pas dans `web/app`) : copier `web/development.env.example` → `.env`, puis :

```bash
docker compose up -d
```

Le conteneur `app` exécute `npm install` et `next dev` sur `0.0.0.0:3000`. `DATABASE_URL` reçoit automatiquement l’hôte **`db`** (MySQL du Compose). `NEXTAUTH_URL` / `NEXTAUTH_SECRET` / `AUTH_SECRET` : voir le service `app` dans `docker-compose.yml`.

**Premier usage après ajout / modification du schéma Prisma** :

```bash
docker compose exec app npx prisma migrate dev --name init
docker compose exec app npx prisma db seed
```

(Comptes par défaut du seed : `SPECS/AUTH` / `prisma/seed.ts` — ex. `admin@aerispay.com` si `SEED_ADMIN_*` non définis.)

### Sans Docker (hôte)

Depuis `web/app/` : créer `/.env.local` avec `DATABASE_URL=mysql://...localhost:PORT/...` et lancer `npm run dev` après `npx prisma migrate dev`.

## Scripts utiles

| Script | Rôle |
|--------|------|
| `npm run dev` | Serveur de dev |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | `prisma db seed` |
| `npm run db:generate` | `prisma generate` |

## Documentation

Racine du dépôt : `CLAUDE.md`, `ARCHITECTURE_MVP.md`, `SPECS/`, `DOCKER.md`.

TDD, matériel POS, conventions : `../CLAUDE.md` (dépôt) et `CLAUDE.md` ici le cas échéant.

---

*Projet structuré selon le dépôt AerisPay (Compose à la racine, code dans `web/app/`).*
