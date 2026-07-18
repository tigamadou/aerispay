# AerisPay — Consignes pour Agents IA

> Ce fichier est lu automatiquement par Claude Code et tout agent IA travaillant sur ce projet.
> Il prime sur toute autre instruction par défaut.

---

## 1. Contexte & architecture

**AerisPay** est une application de **caisse enregistreuse (POS)** et de **gestion commerciale**
pour petits et moyens commerces. Le produit a migré d'une application web mono-base vers une
**architecture desktop à 3 niveaux** (livrée le 2026-06-26 : logique nœud multi-caisse, client
Electron `desktop/`, packaging electron-builder et schéma cloud `cloud/prisma/`) :

```
┌─ Niveau 1 — CAISSE / POSTE ────────── Client Electron, SANS base de données
│     Renderer = UI servie par le nœud · Main = périphériques (ESC/POS, tiroir, douchette)
│     Bloque si le nœud est indisponible (pas de mode dégradé)
│            │ HTTPS LAN (token magasin scopé par poste)
├─ Niveau 2 — NŒUD MAGASIN ──────────── Backend Next.js + Prisma + MySQL (CE dépôt), en local
│     Source de vérité du magasin · API · worker de synchronisation · outbox EventCaisse
│            │ sync magasin ↔ cloud (eventual consistency)
└─ Niveau 3 — CLOUD / ORGANISATION ──── Agrégation multi-magasins · référence descendante · audit
```

**Décision structurante (ADR-001) : il n'y a pas de mode autonome.** Le client Electron est
**toujours** un client du nœud magasin ; le nœud n'est jamais embarqué dans le client (il peut être
co-localisé en `localhost` pour un mono-poste, mais reste un service distinct).

Le code applicatif de ce dépôt **est le nœud magasin**. Sa logique métier (caisse, stock, ventes,
sessions) ne change pas avec le pivot — seule la topologie de déploiement évolue.

**Modules** : Stock · Comptoir (POS) / Ventes · Caisse & sessions (ouverture/clôture/validation à
l'aveugle, réconciliation, fond & levée, intégrité) · Taxes · Paramètres · Journal d'activité ·
Dashboard.

---

## 2. Documentation de référence (À LIRE avant de coder)

| Besoin | Où |
|---|---|
| **Le *QUOI*** — comportement produit dérivé du code (règles, modèles, endpoints) | **`docs/product/`** (index dans `docs/product/README.md`) |
| **Le *COMMENT*** — architecture desktop, synchronisation, sécurité, **ADR** | `ARCHITECTURE_MVP.md` |
| **Exploitation du nœud** (supervision, sauvegardes/restauration, incidents) | `RUNBOOK.md` |
| **Backlog fonctionnel résiduel** (hors migration desktop) | `docs/product/README.md` |
| **Architecture & schéma de données** | `ARCHITECTURE_MVP.md` |
| **Déploiement (nœud magasin)** | `DOCKER.md` |

> La doc produit (`docs/product/`) est dérivée du code et fait foi ; l'ancien dossier de specs
> a été retiré. La migration desktop 3 niveaux est **livrée** (2026-06-26) ; le pilotage par roadmap
> n'est plus actif. Avant toute tâche : lire la doc produit du module concerné et le backlog résiduel
> (`docs/product/README.md`).

---

## 3. Stack technique

```
Client desktop : Electron (main Node : périphériques ; renderer : UI du nœud) — livré sous `desktop/`
Frontend       : Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn/ui
State          : Zustand (panier POS) · TanStack Query (données async)
Forms          : React Hook Form + Zod
Backend (nœud) : Next.js API Routes · Prisma · MySQL
Auth           : NextAuth.js v5 (credentials) — au niveau nœud magasin
PDF            : @react-pdf/renderer
Thermique      : node-thermal-printer (ESC/POS) — dans le main Electron (`desktop/src/devices.ts`) ;
                 contenu du ticket construit par `web/app` (`lib/receipt/buildReceiptContent`)
Sync           : worker magasin ↔ cloud, outbox EventCaisse (référence descendante / transactionnel montant)
Tests          : Vitest + React Testing Library + Cypress/Playwright (e2e)
Qualité        : ESLint + Prettier
```

---

## 4. Structure du dépôt

> **Règle absolue :** le code applicatif vit sous **`web/app/src/`** (App Router, composants, lib,
> tests dans `web/app/src/__tests__/`). Prisma sous `web/app/prisma/`. Docker Compose et docs à la
> **racine**. Les chemins des tickets sont relatifs à `web/app/` sauf mention contraire.

```
aerispay/
├── docker-compose.yml · docker-compose.prod.yml · DOCKER.md
├── CLAUDE.md · ARCHITECTURE_MVP.md · RUNBOOK.md · CONVENTIONS.md · README.md
│      └ ARCHITECTURE_MVP.md = le COMMENT (topologie, ADR, sync, sécurité) · RUNBOOK.md = exploitation
├── docs/
│   └── product/                  ← doc produit (le QUOI), dérivée du code — 01..09 + README
├── desktop/                       ← client Electron (niveau 1) : main périphériques + renderer kiosque
├── cloud/                         ← schéma cloud (niveau 3) : prisma/schema.prisma (agrégation)
└── web/
    ├── Dockerfile · development.env.example · production.env.example
    └── app/                       ← nœud magasin (npm/npx/prisma depuis ici)
        ├── src/
        │   ├── app/               ← App Router : (auth)/, (dashboard)/, api/
        │   ├── components/        ← ui/ (shadcn, NE PAS modifier) · stock/ · comptoir/ · …
        │   ├── lib/               ← db.ts · auth.ts · permissions.ts · activity-log.ts ·
        │   │                         services/ (cash-movement, reconciliation, seuils, integrity) ·
        │   │                         validations/ · receipt/ · rate-limit.ts
        │   ├── hooks/ · store/ · types/
        │   └── __tests__/         ← Vitest / RTL
        └── prisma/                ← schema.prisma · migrations/ · seed
```

(Cartographie exhaustive des pages et endpoints : `docs/product/09-pages-api.md`.)

---

## 5. Règles impératives

### 5.1 Avant de coder
- Lire `CONVENTIONS.md`, la doc produit du module (`docs/product/`), et le backlog résiduel (`docs/product/README.md`).
- Pour une action sensible (caisse, ventes, auth, stock) : vérifier `docs/product/07-journal-activite.md`
  et appeler `logActivity` lorsque c'est prévu.
- **TDD obligatoire** : écrire les tests d'abord, les voir échouer, puis le code minimal pour les faire passer.
- Ne jamais modifier `components/ui/` (shadcn).
- **Next.js 16 a des breaking changes** : lire les guides sous `web/app/node_modules/next/dist/docs/`
  avant d'écrire du code Next (cf. `web/app/AGENTS.md`).

### 5.2 TypeScript
- **Strict** — pas de `any`, pas de `as unknown`. Props typées par interface/type nommé.
- Réponses d'API à type de retour explicite. Utiliser les types Prisma générés (`import type { Produit } from '@prisma/client'`).

### 5.3 API Routes
- Valider les inputs avec **Zod** avant Prisma. Wrapper les opérations DB dans **try/catch**.
- Erreurs : `{ error: string, code?: string }` · Succès : `{ data: T, message?: string }`.
- Transactions multi-écritures via `prisma.$transaction()` (ex. vente + stock + mouvements caisse).

```ts
export async function POST(req: Request) {
  try {
    const parsed = ProduitSchema.safeParse(await req.json())
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

### 5.4 Composants React
- Fonctionnels uniquement, props typées par interface dédiée. Composants shadcn/ui. Tailwind only.
- Formulaires : React Hook Form + Zod resolver.

### 5.5 Prisma & base de données
- Ne jamais exposer le client Prisma dans les composants ; utiliser le singleton `lib/db.ts`.
- Migrations : `npx prisma migrate dev --name <description>`. Garder `seed` cohérent.

### 5.6 État
- **TanStack Query** pour les données serveur · **Zustand** pour l'état UI local (panier POS).
  Pas de Redux, pas de Context pour la data fetching.

### 5.7 Sécurité
- Toute API Route vérifie l'authentification (`requireAuth` / `getServerSession`).
- **Pas d'inscription publique** : création d'utilisateurs par **ADMIN** uniquement (`/api/users`).
- Actions sensibles (annuler vente, modifier stock, force-close) : vérifier le rôle (`hasPermission`/`requireRole`).
- Ne jamais logger de données sensibles (mots de passe, tokens). Secrets en `.env.local` (non commité) ;
  en desktop, tokens dans le trousseau OS (voir `ARCHITECTURE_MVP.md` §8 — Sécurité).

### 5.8 Tests
- **TDD obligatoire** : Vitest (API/métier), RTL (composants critiques : Cart, PaymentModal, ProductForm),
  Cypress/Playwright (flux e2e). Un ticket n'est terminé que si les tests du comportement passent.
- Baseline de référence : `cd web/app && npx vitest run`.

---

## 6. Variables d'environnement (nœud magasin)

```env
# web/app/.env.local (dev — Next.js sur l'hôte ; avec docker compose, base sur localhost:3306)
DATABASE_URL="mysql://user:password@localhost:3306/aerispay"
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="http://aerispay.localhost"
# Optionnel : NEXT_PUBLIC_APP_NAME · NEXT_PUBLIC_APP_VERSION · PRINTER_* · CASH_DRAWER_*
```

En **production**, `DATABASE_URL` pointe vers le service Compose `db` (hostname `db`) — voir `DOCKER.md`.

---

## 7. Commandes utiles

```bash
npm run dev                                   # nœud magasin (depuis web/app/)
docker compose up -d                          # dev : MySQL + phpMyAdmin (depuis la racine)
npx prisma migrate dev --name <desc>          # migration
npx prisma db seed                            # données de test
npm run test                                  # Vitest      ·  npm run test:e2e     # Cypress
npm run lint  ·  npm run format  ·  npm run type-check
```

---

## 8. Comportement attendu des agents

1. **Lire ce fichier en entier.**
2. Identifier la tâche dans le **backlog fonctionnel résiduel** (`docs/product/README.md`) ; pour une nouvelle vague de travail, créer un document de pilotage dédié.
3. Lire la **doc produit** du module (`docs/product/`) et `CONVENTIONS.md`.
4. **Écrire/mettre à jour les tests d'abord** (TDD), puis du code complet et fonctionnel (pas de pseudo-code, pas de `// TODO`).
5. Tester avant de marquer terminé ; **mettre à jour la doc produit concernée** si le comportement change.
6. Ne pas modifier `CLAUDE.md` ou les ADR sans instruction explicite.

### 8.1 Specs & plans d'implémentation — **éphémères**
Les documents de **spec** (`docs/superpowers/specs/`) et de **plan d'implémentation** sont des artefacts de travail **temporaires**, pas de la doc pérenne. Dès qu'une fonctionnalité est **implémentée et vérifiée** (tests verts), **supprimer** le fichier de spec et le fichier de plan correspondants — dans le **même commit/PR** que la fin de l'implémentation. La connaissance pérenne va dans la **doc produit** (`docs/product/`, le QUOI) et `ARCHITECTURE_MVP.md` (le COMMENT + ADR), pas dans les specs/plans.

### 8.2 Convention de commit
- **Aucun commit automatique.** C'est **l'utilisateur** qui réalise les commits. Ne jamais lancer `git commit` (ni `git add` en vue d'un commit) sans une **instruction explicite et précise** de l'utilisateur le demandant. À la fin d'une tâche : s'arrêter, signaler que le travail est terminé et prêt à committer (un message peut être suggéré), puis attendre. Cette règle prime sur toute consigne d'exécution de plan (y compris `scripts/run-plans.sh`) qui supposerait un commit par tâche.
- Les messages de commit **ne contiennent jamais** de mention de **co-auteur** (`Co-Authored-By`). (Le trailer `Claude-Session:` reste autorisé.)

---

*AerisPay · architecture desktop 3 niveaux · doc produit dérivée du code (`docs/product/`).*
