# AerisPay — TODO Sprint Actuel

> **Phase en cours :** Phase 0 — Fondations  
> **Dernière mise à jour :** 23 Avril 2026  
> **Prochain ticket :** SETUP-00  
> **Contexte :** toute l’infrastructure d’exécution (MySQL, phpMyAdmin, image de prod) est pilotée par **Docker Compose** ; le code applicatif vit dans le dossier **`web/`** à la racine du dépôt.

---

## Structure du dépôt

| Emplacement | Contenu |
|-------------|--------|
| **Racine** (`./`) | Documentation : `ARCHITECTURE_MVP.md`, `CLAUDE.md`, `SPECS/`, `ROADMAP.md`, `CONVENTIONS.md`, `DOCKER.md`, `README.md` |
| **`web/`** | Application Next.js, `package.json`, Prisma, `app/`, `lib/`, `components/`, ainsi que `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml` et les fichiers d’environnement d’exemple associés |

**Règle :** toutes les commandes `npm`, `npx` (Prisma, Next) et `docker compose` ciblant l’app ou la stack se lancent depuis **`web/`** (ou avec `-f web/...` si besoin depuis la racine). Les **chemins de fichiers** listés dans les tickets sont relatifs à **`web/`**, sauf mention « racine du dépôt ».

---

## 🔴 En cours

_Aucune tâche en cours — prêt à démarrer_

---

## 🟡 À faire — Phase 0 (Fondations)

### SETUP-00 — Prérequis : Docker (stack locale)
**Assigné à :** Agent  
**Priorité :** 🔴 Critique  
**Dépend de :** —  
**Spec :** `DOCKER.md` (équivalent fonctionnel : `web/docker-compose.yml`)

**Instructions :**
```bash
cd web
docker compose up -d
```

Cela démarre **MySQL 8.4** et **phpMyAdmin** (volumes et réseau nommés, cf. `DOCKER.md`).

- Copier / compléter les variables depuis `web/development.env.example` vers **`web/.env.local`** (en particulier `DATABASE_URL=mysql://…@localhost:3306/…` pour l’hôte, port aligné sur `docker-compose`).

**Critères d'acceptation :**
- [ ] `docker compose ps` (depuis `web/`) montre les services `db` (healthy) et `phpmyadmin`
- [ ] MySQL joignable depuis la machine hôte sur le port exposé (ex. `3306`) ; phpMyAdmin via le port mappé (ex. `http://localhost:8080`)
- [ ] Aucun secret d’environnement commité (fichiers listés dans `web/.gitignore`)

---

### SETUP-01 — Initialisation du projet Next.js dans `web/`
**Assigné à :** Agent  
**Priorité :** 🔴 Critique  
**Dépend de :** — (peut être parallélisé avec SETUP-00)  
**Spec :** `CLAUDE.md` section 2 (Stack)

**Instructions :** tout se fait **sous `web/`** (c’est le répertoire de l’application, à côté des fichiers Docker déjà présents).

```bash
cd web
# Si le squelette Next.js n’existe pas encore (dossier sans package.json Next) :
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

# Installer les dépendances principales
npm install @prisma/client prisma next-auth@beta \
  @auth/prisma-adapter zod react-hook-form \
  @hookform/resolvers zustand @tanstack/react-query \
  @tanstack/react-query-devtools bcryptjs

# Installer shadcn/ui
npx shadcn@latest init
# Sélectionner: Default style, Slate color, CSS variables: Yes
npx shadcn@latest add button input label card table \
  dialog sheet badge select toast form

# Dépendances développement
npm install -D @types/bcryptjs vitest @vitejs/plugin-react \
  @testing-library/react @testing-library/user-event \
  @playwright/test prettier eslint-config-prettier
```

**Note :** si le projet a déjà été initialisé, ne lancer que les `npm install` / `npx shadcn` manquants.

**Critères d'acceptation :**
- [ ] `npm run dev` (lancé depuis `web/`) démarre sans erreur sur `http://localhost:3000`
- [ ] TypeScript strict mode activé dans `web/tsconfig.json`
- [ ] Prettier configuré avec `web/.prettierrc` (ou équivalent)
- [ ] ESLint configuré avec règles strictes
- [ ] Alias `@/*` fonctionnel vers `web/src` (ou `web` selon structure choisie par create-next-app)

---

### SETUP-02 — Configuration Prisma + MySQL
**Assigné à :** Agent  
**Priorité :** 🔴 Critique  
**Dépend de :** SETUP-00, SETUP-01  
**Spec :** `ARCHITECTURE_MVP.md` section 4

**Instructions :**
1. S’assurer que la stack Docker (SETUP-00) est **up** et que `web/.env.local` contient un `DATABASE_URL` valide (hôte `localhost` depuis l’hôte, pas `db`).
2. Copier le schéma Prisma complet dans **`web/prisma/schema.prisma`**
3. Créer **`web/lib/db.ts`** avec le singleton Prisma (voir `CONVENTIONS.md` section 6)
4. `cd web` puis : `npx prisma migrate dev --name init`, puis vérifier avec `npx prisma studio`

**Critères d'acceptation :**
- [ ] Toutes les tables créées en MySQL (conteneur Docker)
- [ ] `npx prisma studio` (depuis `web/`) : tables visibles
- [ ] Pas d'erreur TypeScript sur les types Prisma générés

---

### SETUP-03 — Authentification NextAuth.js v5
**Assigné à :** Agent  
**Priorité :** 🔴 Critique  
**Dépend de :** SETUP-02  
**Spec :** `SPECS/AUTH.md`

**Fichiers à créer (sous `web/`) :**
- `lib/auth.ts` — configuration NextAuth
- `app/api/auth/[...nextauth]/route.ts` (ou chemin src selon le projet)
- `middleware.ts` (à la racine du projet Next = `web/`)
- `app/(auth)/login/page.tsx`, `app/(auth)/login/LoginForm.tsx`
- **Pas** de page `/register` ni d'inscription publique
- `app/api/users/route.ts` + `app/api/users/[id]/route.ts` — CRUD restreint au rôle `ADMIN` uniquement
- `app/(dashboard)/users/page.tsx` + `users/nouveau/page.tsx` + composants (voir `SPECS/AUTH.md`)

**Critères d'acceptation :**
- [ ] Login email/password fonctionnel
- [ ] Session JWT avec `{ id, name, email, role }` (aligner les clés sur le modèle)
- [ ] Route `/` redirige vers `/login` si non connecté
- [ ] Route `/login` redirige vers `/` si déjà connecté
- [ ] Logout fonctionnel
- [ ] Seul un `ADMIN` peut lister / créer / modifier des utilisateurs (403 pour les autres rôles)

---

### SETUP-04 — Layout principal
**Assigné à :** Agent  
**Priorité :** 🟡 Haute  
**Dépend de :** SETUP-03  

**Fichiers à créer (sous `web/`) :**
- `app/(dashboard)/layout.tsx`
- `components/shared/Sidebar.tsx`
- `components/shared/Navbar.tsx`
- `components/shared/KPICard.tsx`
- `app/(dashboard)/page.tsx` (dashboard vide)

**Critères d'acceptation :**
- [ ] Sidebar avec liens : Dashboard, Stock, Caisse ; **Utilisateurs** si `ADMIN` ; **Journal d’activité** si `ADMIN` ou `MANAGER` (cf. `SPECS/ACTIVITY_LOG.md`)
- [ ] Navbar avec nom utilisateur et bouton déconnexion
- [ ] Layout responsive (mobile: sidebar collapsible)
- [ ] Page dashboard affiche "Bienvenue, [Nom]"

---

### SETUP-05 — Seed de base de données
**Assigné à :** Agent  
**Priorité :** 🟡 Haute  
**Dépend de :** SETUP-02  

**Fichier à créer :** `web/prisma/seed.ts` + entrée `prisma` dans `package.json` si besoin

**Données à créer :**
- 1 Admin : `admin@aerispay.com` / `Admin@1234` / rôle ADMIN
- 1 Manager : `manager@aerispay.com` / `Manager@1234` / rôle MANAGER
- 1 Caissier : `caissier@aerispay.com` / `Caissier@1234` / rôle CAISSIER
- 5 catégories : Alimentation, Boissons, Hygiène, Électronique, Divers
- 20 produits réalistes avec prix et stock variés (certains en alerte)

**Critères d'acceptation :**
- [ ] `cd web && npx prisma db seed` sans erreur
- [ ] 3 utilisateurs créés avec hash bcrypt correct
- [ ] 20 produits avec stock varié (certains sous seuil minimum)
- [ ] Les 3 comptes peuvent se connecter

---

## 🐳 Rappel Docker (résumé)

- **Développement :** `cd web && docker compose up -d` — base + phpMyAdmin (cf. `DOCKER.md`).
- **Production :** `cd web && docker compose -f docker-compose.prod.yml --env-file <fichier-env> up -d --build` (image Next construite par `web/Dockerfile`).
- Toute l’**application** et les **artefacts Docker** pour l’app sont dans **`web/`** ; la doc de référence conteneur reste à la **racine** : `DOCKER.md` (à aligner sur les chemins `web/…`).

---

## ✅ Terminé

- [x] Architecture définie (`ARCHITECTURE_MVP.md`)
- [x] Schéma Prisma complet rédigé
- [x] Roadmap complète (`ROADMAP.md`)
- [x] Specs fonctionnelles rédigées (`SPECS/`)
- [x] Conventions de code définies (`CONVENTIONS.md`)
- [x] Fichier de consignes agents (`CLAUDE.md`)
- [x] Stack Docker (fichiers applicatifs sous `web/`)

---

## 📋 Instructions pour l'Agent qui prend ce TODO

1. **Commence toujours par lire** `CLAUDE.md` en entier
2. **Travaille le code applicatif** dans **`web/`** (pas à la racine du dépôt, sauf documentation)
3. **Démarre** MySQL (et outils) avec **Docker** depuis `web/` avant migrations / seed
4. **Prends le premier ticket** non commencé de la section "À faire" (ordre : SETUP-00 → …)
5. **Lis la spec** correspondante avant de coder
6. **Respecte les conventions** de `CONVENTIONS.md` — chemins côté code = `web/...` dans ce dépôt
7. **Marque la tâche ✅** une fois terminée et les critères validés
8. **Passe au ticket suivant** dans l'ordre de priorité

> Ne jamais placer le code source Next/Prisma **hors** de `web/` (sauf explicitation contraire)  
> Ne jamais modifier les fichiers de documentation (`*.md` hors `web/`) **sans instruction explicite**  
> Toujours viser des tests pour le code produit (dans `web/`, ex. `vitest` / `playwright`)

---

*Mis à jour le : 23 Avril 2026*
