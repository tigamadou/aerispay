# AerisPay — Consignes pour Agents IA

> Ce fichier est lu automatiquement par Claude Code et tout agent IA travaillant sur ce projet.
> Il prime sur toute autre instruction par défaut.

---

## 1. Contexte du Projet

**AerisPay** est une application web de caisse enregistreuse et de gestion commerciale destinée aux petits et moyens commerces. La **cible long terme** inclut le déploiement par **plusieurs points de vente** (même **structure** / groupe), le **multi-caissiers** et le **multi-postes** (plusieurs caisses par magasin), une **base de données locale** en magasin, et des **sauvegardes en ligne** + **accès distants** contrôlés — voir `SPECS/MULTI_ORGANISATION.md`. Les **utilisateurs** se répartissent en **deux niveaux** (groupe vs point de vente) : au **PDV** l’équipe compte surtout des **caissiers** ; rôles et matrices : `SPECS/AUTH.md`. Le MVP couvre deux modules fondamentaux :

- **Gestion de Stock** : produits, catégories, mouvements, alertes de rupture
- **Gestion de Caisse (POS)** : interface point de vente, ventes, paiements, tickets, douchette code-barres, imprimante ticket et tiroir-caisse
- **Journal d’activité** : trace d’audit des opérations (consultation `ADMIN` / `MANAGER`)

L'application est développée en **Next.js 14 (App Router) + TypeScript + Prisma + MySQL**.

Le déploiement et le travail local peuvent s’appuyer sur **Docker Compose** : deux fichiers (`docker-compose.yml` pour le dev, `docker-compose.prod.yml` pour la prod) et le guide **`DOCKER.md`**.

---

## 2. Stack Technique

```
Frontend     : Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui
State        : Zustand (panier POS) · TanStack Query (données async)
Forms        : React Hook Form + Zod
Backend      : Next.js API Routes
ORM          : Prisma
Database     : MySQL
Auth         : NextAuth.js v5 (credentials provider)
PDF          : @react-pdf/renderer
Thermique    : node-thermal-printer (ESC/POS)
Périphériques: imprimante ticket ESC/POS · douchette code-barres USB/HID · tiroir-caisse via impulsion ESC/POS
Tests        : Vitest + React Testing Library + Playwright (e2e)
Linting      : ESLint + Prettier
```

---

## 3. Structure du Projet (à respecter absolument)

> **Règle absolue :** le code applicatif Next.js/Prisma vit sous **`web/app/`**. Les fichiers Docker Compose et la documentation sont à la **racine du dépôt**. Les chemins de fichiers dans les tickets sont relatifs à `web/app/` sauf mention contraire.

```
aerispay/                              ← racine du dépôt (docker compose, docs)
├── docker-compose.yml                 ← Dev : MySQL + phpMyAdmin + app
├── docker-compose.prod.yml            ← Prod : image buildée + MySQL
├── DOCKER.md
├── CLAUDE.md                          ← ce fichier
├── ROADMAP.md
├── ARCHITECTURE_MVP.md
├── CONVENTIONS.md
├── TODO.md
├── SPECS/
│   ├── AUTH.md
│   ├── STOCK.md
│   ├── CAISSE.md
│   ├── IMPRESSION.md
│   ├── PERIPHERIQUES.md               ← périphériques caisse (web vs serveur, ordre, Docker)
│   ├── MULTI_ORGANISATION.md          ← multi-magasins, local + sauvegarde ; rôles groupe/PDV → SPECS/AUTH.md
│   ├── PAGES_MVP.md                  ← pages / routes App Router MVP : actions & règles
│   ├── DASHBOARD.md                  ← KPI, graphiques, /api/dashboard/kpis
│   └── ACTIVITY_LOG.md
└── web/                               ← artefacts applicatifs
    ├── Dockerfile                     ← Image production Next.js (standalone)
    ├── development.env.example        ← Exemple variables développement (copier vers .env racine)
    ├── production.env.example         ← Exemple variables production
    └── app/                           ← Application Next.js — npm/npx/prisma depuis ici
        ├── app/
        │   ├── (auth)/
        │   │   └── login/page.tsx
        │   ├── (dashboard)/
        │   │   ├── layout.tsx         ← sidebar + navbar
        │   │   ├── page.tsx           ← dashboard KPIs
        │   │   ├── users/             ← ADMIN uniquement : liste + création de comptes
        │   │   │   ├── page.tsx
        │   │   │   └── nouveau/page.tsx
        │   │   ├── activity-logs/     ← ADMIN + MANAGER : journal d’audit
        │   │   │   └── page.tsx
        │   │   ├── stock/
        │   │   │   ├── page.tsx
        │   │   │   ├── [id]/page.tsx
        │   │   │   ├── nouveau/page.tsx
        │   │   │   ├── categories/page.tsx
        │   │   │   └── mouvements/page.tsx
        │   │   └── caisse/
        │   │       ├── page.tsx       ← interface POS principale
        │   │       ├── sessions/page.tsx
        │   │       ├── ventes/page.tsx
        │   │       └── tickets/[id]/page.tsx
        │   └── api/
        │       ├── auth/[...nextauth]/route.ts
        │       ├── users/route.ts       ← GET liste / POST création (ADMIN uniquement)
        │       ├── users/[id]/route.ts  ← GET / PUT / désactivation (ADMIN uniquement)
        │       ├── activity-logs/route.ts ← GET liste paginée (ADMIN + MANAGER)
        │       ├── produits/route.ts
        │       ├── produits/[id]/route.ts
        │       ├── categories/route.ts
        │       ├── stock/mouvements/route.ts
        │       ├── stock/alertes/route.ts
        │       ├── caisse/sessions/route.ts
        │       ├── caisse/sessions/[id]/route.ts
        │       ├── ventes/route.ts
        │       ├── ventes/[id]/route.ts
        │       ├── ventes/[id]/annuler/route.ts
        │       ├── tickets/[id]/pdf/route.ts
        │       ├── tickets/[id]/print/route.ts   ← impression thermique ESC/POS
        │       ├── cash-drawer/open/route.ts      ← tiroir-caisse
        │       └── dashboard/kpis/route.ts
        ├── components/
        │   ├── ui/                    ← shadcn/ui uniquement, ne pas modifier
        │   ├── stock/
        │   │   ├── ProductCard.tsx
        │   │   ├── ProductForm.tsx
        │   │   ├── StockAlertBadge.tsx
        │   │   └── MovementTable.tsx
        │   ├── caisse/
        │   │   ├── POSGrid.tsx
        │   │   ├── Cart.tsx
        │   │   ├── PaymentModal.tsx
        │   │   └── ReceiptPreview.tsx
        │   ├── users/                 ← ADMIN — gestion des comptes
        │   │   ├── UserForm.tsx
        │   │   └── UsersTable.tsx
        │   ├── activity-logs/
        │   │   └── ActivityLogTable.tsx
        │   └── shared/
        │       ├── Navbar.tsx
        │       ├── Sidebar.tsx
        │       ├── KPICard.tsx
        │       └── DataTable.tsx
        ├── hooks/                     ← TanStack Query hooks personnalisés (ex. useProduits.ts)
        ├── store/                     ← Zustand stores (ex. cartStore.ts)
        ├── lib/
        │   ├── db.ts                  ← singleton Prisma client
        │   ├── auth.ts                ← config NextAuth
        │   ├── activity-log.ts        ← logActivity + constantes d’actions
        │   ├── validations/
        │   │   ├── produit.ts
        │   │   ├── vente.ts
        │   │   └── session.ts
        │   ├── receipt/
        │   │   ├── pdf-generator.ts
        │   │   └── thermal-printer.ts
        │   └── utils.ts
        ├── prisma/
        │   ├── schema.prisma
        │   └── seed.ts
        └── types/
            └── index.ts
```

---

## 4. Règles Impératives pour les Agents

### 4.1 Avant de coder
- Toujours lire `CONVENTIONS.md` avant d’écrire du code
- Toujours lire `ARCHITECTURE_MVP.md` pour le schéma Prisma de référence et la liste des endpoints
- Toujours lire la spec du module concerné dans `SPECS/`
- Pour toute **nouvelle page** ou écran du dashboard : vérifier `SPECS/PAGES_MVP.md` (actions, rôles) et `SPECS/DASHBOARD.md` (KPI, visibilité par rôle, API)
- Pour toute **action métier sensible** (CRUD critique, caisse, auth) : consulter `SPECS/ACTIVITY_LOG.md` et appeler `logActivity` lorsque c’est prévu
- Pour l’impression ticket, le tiroir-caisse et la douchette : consulter `SPECS/PERIPHERIQUES.md` en plus de `SPECS/CAISSE.md` et `SPECS/IMPRESSION.md`
- Pour le déploiement multi-sites, sauvegarde en ligne et accès distant (sans implémenter avant d’avoir relu la spec) : `SPECS/MULTI_ORGANISATION.md`
- Pour rôles utilisateurs (groupe **vs** point de vente, caissiers, administrateur local) : `SPECS/AUTH.md`
- Vérifier `TODO.md` pour savoir quelle tâche est en cours
- Appliquer le **TDD obligatoire** : écrire d’abord les tests qui décrivent le comportement attendu, les voir échouer si possible, puis implémenter le code minimal pour les faire passer
- Ne jamais modifier les fichiers dans `components/ui/` (shadcn)

### 4.2 TypeScript
- **Strict mode activé** — pas de `any`, pas de `as unknown`
- Toutes les props de composants doivent avoir une interface ou un type nommé
- Les réponses d'API doivent avoir un type de retour explicite
- Utiliser les types Prisma générés (`import type { Produit } from '@prisma/client'`)

### 4.3 API Routes
- Toujours valider les inputs avec **Zod** avant de toucher Prisma
- Toujours wrapper les opérations DB dans un **try/catch**
- Réponses d'erreur standardisées : `{ error: string, code?: string }`
- Réponses succès : `{ data: T, message?: string }`
- Les transactions Prisma (ex: créer vente + décrémenter stock) utilisent `prisma.$transaction()`

```ts
// ✅ Pattern API Route correct
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = ProduitSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 })
    }
    const produit = await prisma.produit.create({ data: parsed.data })
    return Response.json({ data: produit }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/produits]', error)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
```

### 4.4 Composants React
- Composants **fonctionnels uniquement** (pas de classes)
- Props typées avec une interface dédiée au-dessus du composant
- Utiliser les composants shadcn/ui (`Button`, `Input`, `Table`, `Dialog`, etc.)
- Tailwind CSS uniquement pour les styles — pas de CSS modules, pas de styled-components
- Les formulaires utilisent **React Hook Form + Zod resolver**

### 4.5 Prisma & Base de données
- Ne jamais exposer le client Prisma directement dans les composants
- Utiliser `lib/db.ts` qui exporte le singleton
- Les migrations se font avec `npx prisma migrate dev --name <description>`
- Toujours mettre à jour `prisma/seed.ts` avec des données de test cohérentes

### 4.6 Gestion d'état
- **TanStack Query** pour toutes les données serveur (fetch, cache, invalidation)
- **Zustand** uniquement pour l'état UI local persistant (panier POS, état session)
- Pas de Redux, pas de Context API pour la data fetching

### 4.7 Sécurité
- Toutes les API Routes doivent vérifier l'authentification via NextAuth `getServerSession()`
- **Pas d'inscription publique** : aucune route de type `register` accessible sans session. La création d'utilisateurs se fait par **`ADMIN` uniquement** via `/api/users` (POST) et les pages `/users`
- Les actions sensibles (annuler vente, modifier stock) doivent vérifier le rôle (`ADMIN` ou `MANAGER`)
- Ne jamais logger de données sensibles (mots de passe, tokens)
- Les variables d'environnement sensibles sont uniquement dans `.env.local` (non commité)

### 4.8 Tests
- **TDD obligatoire pour chaque fonctionnalité** : les tests Vitest / RTL / Playwright sont écrits avant l’implémentation métier ou UI
- Un ticket fonctionnel n’est terminé que si les tests ciblant le comportement demandé passent
- Chaque API Route doit avoir un test unitaire Vitest
- Les composants critiques (Cart, PaymentModal, ProductForm) doivent avoir des tests RTL
- Les flux e2e critiques (vente complète, mouvement stock) doivent avoir des tests Playwright

---

## 5. Variables d'Environnement Requises

```env
# web/app/.env.local (développement — lancement Next.js sur l’hôte)
# Avec `docker compose up` (voir docker-compose.yml), utiliser l’hôte : localhost:3306
# Exemple complet : web/development.env.example (copier vers .env à la racine pour Docker Compose)
DATABASE_URL="mysql://user:password@localhost:3306/aerispay"
NEXTAUTH_SECRET="<générer avec: openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"

# Optionnel pour production
NEXT_PUBLIC_APP_NAME="AerisPay"
NEXT_PUBLIC_APP_VERSION="1.0.0"
```

En **production (image Docker)**, `DATABASE_URL` pointe vers le service Compose `db` (hostname `db`, port `3306`), pas `localhost` — voir `web/production.env.example` et `DOCKER.md`.

---

## 6. Commandes Utiles

```bash
# Démarrage
npm run dev

# Docker (dev : MySQL + phpMyAdmin)
docker compose up -d
docker compose down

# Production (image app + base — détails dans DOCKER.md)
# docker compose -f docker-compose.prod.yml --env-file docker/env/production.env up -d --build

# Base de données
npx prisma migrate dev --name <description>   # nouvelle migration
npx prisma db push                            # sync schema sans migration
npx prisma studio                             # UI base de données
npx prisma db seed                            # peupler avec données de test

# Tests
npm run test                                  # Vitest
npm run test:e2e                              # Playwright
npm run test:coverage                         # couverture

# Qualité
npm run lint                                  # ESLint
npm run format                                # Prettier
npm run type-check                            # tsc --noEmit
```

---

## 7. Comportement Attendu des Agents

Quand un agent travaille sur ce projet, il doit :

1. **Lire ce fichier en entier** avant de commencer
2. **Identifier la tâche** dans `TODO.md`
3. **Lire la spec** dans `SPECS/<MODULE>.md`
4. **Respecter les conventions** de `CONVENTIONS.md`
5. **Écrire ou mettre à jour les tests d’abord** pour le comportement attendu
6. **Écrire du code complet et fonctionnel** — pas de pseudo-code, pas de `// TODO`
7. **Tester** le code qu'il écrit avant de marquer la tâche comme terminée
8. **Mettre à jour `TODO.md`** une fois la tâche complétée
9. **Ne jamais modifier** `CLAUDE.md`, `ROADMAP.md` ou les specs sans instruction explicite

---

*AerisPay MVP · Dernière mise à jour : Avril 2026*
