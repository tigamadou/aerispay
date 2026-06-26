# Architecture AerisPay

> **Version :** 2.0 — Architecture desktop 3 niveaux
> **Date :** Juin 2026
> **Modules couverts :** Stock · Comptoir (POS) · Caisse & sessions · Taxes/Paramètres · Périphériques · Journal d'activité · Dashboard
> **Stack nœud magasin :** Next.js 16 (App Router) · React 19 · TypeScript · Prisma · MySQL · Tailwind CSS · shadcn/ui
> **Client caisse cible :** Electron (présentation + pont périphériques, **sans base de données**)

> **Où trouver quoi.**
> - **Le QUOI fonctionnel** (comportements réels dérivés du code) : `docs/product/` (auth/rôles, stock, comptoir/ventes, caisse/sessions, impression/périphériques, dashboard, journal, taxes/paramètres, pages & API).
> - **Le COMMENT + décisions** (architecture desktop 3 niveaux, livrée) : `docs/architecture-desktop/` (modèle 3 niveaux, client desktop, enrôlement, nœud magasin, synchronisation cloud, sécurité, déploiement, **ADR** `09-adr.md`, **exploitation** `RUNBOOK.md`).
> - Ce document **ne duplique pas** ces sources : il fixe la topologie cible, ancre les invariants (schéma, rôles, endpoints) et renvoie.

---

## 1. Vue d'ensemble — topologie desktop à trois niveaux

AerisPay est un système de caisse enregistreuse et de gestion commerciale. La cible n'est **plus** une « application web mono-base » mais un **système desktop à trois niveaux** : un client de caisse (Electron) parle à un **nœud magasin** (le backend Next + Prisma + MySQL actuel, tournant **en local** dans le magasin et **source de vérité du magasin**), lequel se synchronise vers un **cloud organisation** (agrégation multi-magasins + référence descendante).

```
┌─────────────────────────────────────────────────────────────┐
│ Niveau 3 — CLOUD / ORGANISATION (entité parente)             │
│   Base cloud agrégée · référence descendante · audit groupe  │
│   Enrôlement magasins/postes · sauvegardes · accès distant   │
└───────────────▲─────────────────────────────────────────────┘
                │  sync magasin ↔ cloud (worker, eventual consistency)
                │  montant = append-only · descendant = référence LWW
┌───────────────┴─────────────────────────────────────────────┐
│ Niveau 2 — NŒUD MAGASIN (source de vérité du magasin)        │
│   Backend Next 16 + Prisma + MySQL ACTUEL, tournant en local │
│   API HTTPS LAN · logique métier · worker de sync · outbox   │
└───────────────▲─────────────────────────────────────────────┘
                │  HTTPS LAN (token magasin scopé par poste)
┌───────────────┴─────────────────────────────────────────────┐
│ Niveau 1 — CAISSE / POSTE (client Electron, SANS BD)         │
│   Renderer = UI servie par le nœud · main = périphériques    │
│   ESC/POS · tiroir · douchette · BLOQUE si nœud indisponible │
└─────────────────────────────────────────────────────────────┘
```

| Niveau | Rôle | Embarque | Autorité |
|---|---|---|---|
| **1 — Caisse / poste** | Terminal de présentation + pont périphériques (imprimante ESC/POS, tiroir, douchette). Identifié par un `caisseId` fixé à l'enrôlement. | **Aucune BD, aucun serveur applicatif.** UI servie par le nœud. | Hash d'intégrité chaîné **par caisse** (cible). |
| **2 — Nœud magasin** | Serveur applicatif (Next + Prisma) + base MySQL du magasin + worker de sync. Toutes les caisses lisent/écrivent **ici** en LAN. | **Le backend actuel, inchangé.** | **Transactionnel** : stock, ventes, sessions, mouvements caisse, journal. |
| **3 — Cloud organisation** | Agrégation inter-magasins, reporting consolidé, données de référence, enrôlement, sauvegardes en ligne, accès distant. | Base cloud MySQL managé (ADR-002). | **Référence** : catalogue, prix, utilisateurs/rôles, taxes, paramètres, seuils. |

Principe directeur (voir `docs/architecture-desktop/01-modele-trois-niveaux.md`) : **référence descendante** (le cloud fait foi, diffusion vers les magasins) et **transactionnel montant** (le magasin fait foi, agrégé append-only par le cloud). Le cloud **ne réécrit jamais** le transactionnel d'un magasin.

### 1.1 Pourquoi ce modèle (et pas du local-first par caisse)

- **Stock strictement cohérent** : toutes les caisses d'un magasin partagent **une seule base**. Le décrément conditionnel atomique (anti-survente) s'exécute contre cette base unique → **pas de survente entre caisses**. Le problème du stock distribué n'apparaît pas.
- **Ledger de caisse intègre** : sessions, mouvements et réconciliation appartiennent à une caisse et vivent dans la base magasin → pas de conflit multi-maître.
- **Le distribué est confiné** à la frontière magasin ↔ cloud, où les flux montants sont **append-only** donc faciles à fusionner.
- **Périphériques fiables** : Electron pilote l'imprimante ESC/POS et le tiroir-caisse hors de portée d'un navigateur.

### 1.2 ADR-001 — Pas de mode autonome (décision structurante actée)

> **Le client Electron est TOUJOURS un client du nœud magasin.** Il n'embarque **jamais** de base de données ni de serveur applicatif. Réf. `docs/architecture-desktop/09-adr.md`.

- Le **nœud magasin** est toujours un service serveur distinct — soit sur une machine dédiée, soit **co-localisé en `localhost`** sur la même machine qu'un poste pour un commerce mono-caisse, mais **jamais empaqueté dans** le client Electron.
- **Conséquences :** 2 modes d'enrôlement (nœud magasin / client) au lieu de 3 ; packaging Electron allégé (pas de Prisma/MySQL à packager, seuls les modules natifs ESC/POS `node-thermal-printer`/`serialport` via `electron-rebuild`) ; déploiement du nœud **inchangé** vs aujourd'hui (Next + Prisma + MySQL, ex. via Docker).
- **Disponibilité assumée :** si le nœud magasin est injoignable, la caisse **bloque** (pas de file locale, pas de mode dégradé). Si le **cloud** est coupé, le magasin continue de fonctionner et rattrape la synchronisation au retour du WAN.

### 1.3 Autres décisions cadre (ADR)

| ADR | Décision | Conséquence clé |
|---|---|---|
| **001** | Pas de mode autonome | Client = toujours client du nœud ; 2 modes d'enrôlement |
| **002** | Cloud = **MySQL managé** | Schéma cloud réutilise le schéma magasin + clés `magasinId`/`organisationId` |
| **003** | Transport « Simple V1 » | Tokens longue durée + **révocation** ; mTLS/rotation auto → backlog V2 |
| **004** | Rétention outbox `EventCaisse` | **30 jours** après accusé cloud puis purge |
| **005** | **Aucune HA** du nœud en V1 | SPOF assumé ; sauvegardes (dump + réplication cloud) |
| **006** | Référence **descendante stricte** | Édition catalogue/prix/users via l'app cloud ; pas d'édition magasin |

Détail complet et conséquences : `docs/architecture-desktop/09-adr.md`.

---

## 2. Carte d'autorité — qui écrit quoi, où

| Donnée | Autorité | Propagation | Remarque |
|---|---|---|---|
| Produits, prix, catégories | **Cloud** | Cloud → magasin | Édition centrale, diffusion descendante (LWW) |
| Utilisateurs, rôles, mots de passe (hash) | **Cloud** | Cloud → magasin | Login servi par le magasin ; désactivation propagée |
| Paramètres, taxes, seuils | **Cloud** | Cloud → magasin | Référence descendante |
| **Stock** (`Produit.stockActuel`, `MouvementStock`) | **Magasin** | Magasin → cloud (agrégation) | Cohérent au sein du magasin (base unique) |
| **Ventes** (`Vente`, `LigneVente`, `Paiement`) | **Magasin** | Magasin → cloud (append-only) | Générées par les caisses, persistées au magasin |
| **Sessions & mouvements caisse** | **Magasin** | Magasin → cloud (append-only) | Ledger, partitionné par caisse |
| **Hash d'intégrité de session** | **Caisse** (au magasin) | Magasin → cloud | Chaîné **par caisse** (cible) |
| **Journal d'activité** | **Magasin** | Magasin → cloud | Audit |

---

## 3. Stack technique

### 3.1 Nœud magasin (backend + UI servie)
| Domaine | Technologie | Rôle |
|---|---|---|
| Framework | **Next.js 16** (App Router) · React 19 | SSR, routing, API Routes intégrées |
| Langage | **TypeScript** (strict) | Typage statique |
| ORM / BD | **Prisma** · **MySQL 8** | Accès type-safe, migrations, source de vérité magasin |
| Auth | **NextAuth.js v5** (credentials) | Sessions, login servi par le nœud |
| UI | **Tailwind CSS** · **shadcn/ui** | Styles, composants accessibles |
| Formulaires | **React Hook Form + Zod** | Validation client/serveur |
| État | **Zustand** (panier POS) · **TanStack Query** (data async) | UI locale persistante · cache/refetch |
| Impression | **@react-pdf/renderer** · **node-thermal-printer** · **qrcode** | Ticket PDF · ESC/POS 58/80 mm · QR vérification |
| Sync | Worker magasin ↔ cloud + outbox **`EventCaisse`** | Réplication transactionnelle + pull référence |
| Tests | **Vitest** · **React Testing Library** · **Cypress/Playwright** | Unitaires · composants · e2e |

> ⚠️ **Next.js 16 introduit des breaking changes** par rapport aux versions antérieures. Avant d'écrire du code Next, consulter les guides versionnés dans `web/app/node_modules/next/dist/docs/` (cf. `web/app/AGENTS.md`).

### 3.2 Client caisse (Electron — cible)
| Domaine | Technologie | Rôle |
|---|---|---|
| Coquille | **Electron** | Fenêtre, `contextIsolation`, `sandbox`, CSP, navigation restreinte |
| Renderer | UI **servie par le nœud magasin** | Aucune logique métier embarquée |
| Main process | **node-thermal-printer** · **serialport** | Pont périphériques ESC/POS / tiroir / douchette via IPC `window.aerisDevices.*` |
| Recompilation native | **electron-rebuild** + CI multi-OS | Modules natifs sur Windows/macOS/Linux |
| Distribution | **electron-builder** · **electron-updater** + S3 | Installeurs signés, auto-update |

Détails : `docs/architecture-desktop/02-client-desktop.md`.

### 3.3 Périphériques de caisse
| Périphérique | Mode | Notes |
|---|---|---|
| **Imprimante ticket** | ESC/POS USB, série ou réseau | Pilotée par le **main Electron** (cible) ; le nœud fournit le contenu du reçu |
| **Douchette code-barres** | USB/HID mode clavier | Sans driver ; scan capturé dans le champ recherche POS |
| **Tiroir-caisse** | Impulsion ESC/POS via imprimante, ou interface directe | Ouverture après paiement espèces validé |

> Une **panne périphérique APRÈS qu'une vente est validée ne doit jamais annuler la vente** (la vente est persistée au nœud ; l'impression/tiroir sont best-effort). Cf. `docs/product/05-impression-peripheriques.md`.

### 3.4 Infrastructure
| Niveau | Déploiement |
|---|---|
| **Nœud magasin** | Machine locale du magasin. Next + Prisma + MySQL, ex. via **Docker Compose** (`docker-compose.yml` dev, `docker-compose.prod.yml` prod ; voir `DOCKER.md`). Pas de HA en V1 (ADR-005) : sauvegardes (dump planifié + réplication cloud comme filet). |
| **Cloud organisation** | **MySQL managé** (ADR-002) + app cloud (agrégation, référence, enrôlement). Sauvegardes en ligne (S3). Accès distant via canaux applicatifs/VPN, **jamais** MySQL exposé directement. |

---

## 4. Méthodologie TDD

Développement en **Test-Driven Development** (obligatoire, cf. `web/app/AGENTS.md`) :

1. Écrire d'abord les tests décrivant le comportement attendu.
2. Vérifier l'échec attendu si le contexte le permet.
3. Implémenter le code minimal pour les faire passer.
4. Refactorer sans affaiblir la couverture.

API Routes et transactions Prisma → **Vitest** ; composants/formulaires critiques → **RTL** ; parcours de bout en bout → **Cypress/Playwright**. Baseline de référence : suite verte (≈ 839 tests sur `feat/audit_refacto`).

---

## 5. Structure du projet (nœud magasin)

> **Règle :** le code applicatif vit sous **`web/app/src/`** (App Router, composants, `lib`, tests dans `web/app/src/__tests__/`). Prisma sous `web/app/prisma/`. Docker Compose et docs à la **racine**. Commandes `npm`/`npx`/`prisma` depuis `web/app/`.

```
aerispay/                              # Racine du dépôt
├── docker-compose.yml                 # Dev : MySQL + phpMyAdmin + app
├── docker-compose.prod.yml            # Prod : image buildée + MySQL
├── DOCKER.md
├── ARCHITECTURE_MVP.md                # Ce fichier (architecture cible)
├── CLAUDE.md · CONVENTIONS.md · README.md
├── docs/
│   ├── product/                       # Le QUOI fonctionnel (dérivé du code)
│   └── architecture-desktop/          # Le COMMENT + ADR + RUNBOOK
├── desktop/                           # Client Electron (niveau 1) : main périphériques + renderer kiosque
├── cloud/                             # Schéma cloud (niveau 3) : prisma/schema.prisma (agrégation)
└── web/
    ├── Dockerfile · development.env.example · production.env.example
    └── app/                           # Application Next.js (nœud magasin)
        ├── src/
        │   ├── app/                   # App Router
        │   │   ├── (auth)/login/
        │   │   ├── (dashboard)/       # layout sidebar + pages
        │   │   │   ├── page.tsx       # Dashboard KPIs
        │   │   │   ├── users/ · activity-logs/ · parametres/ · taxes/
        │   │   │   ├── stock/         # produits, catégories, mouvements
        │   │   │   └── comptoir/      # POS, sessions, ventes, tickets
        │   │   └── api/               # API Routes (voir §8)
        │   ├── components/            # ui/ (shadcn — ne pas modifier), stock/, comptoir/, …
        │   ├── hooks/                 # TanStack Query
        │   ├── store/                 # Zustand (panier POS)
        │   ├── lib/
        │   │   ├── db.ts · auth.ts · permissions.ts · activity-log.ts
        │   │   ├── validations/       # Schémas Zod
        │   │   ├── services/          # cash-movement, reconciliation, seuils, integrity…
        │   │   └── receipt/           # pdf-generator, thermal-printer
        │   └── __tests__/             # Vitest + RTL
        ├── prisma/
        │   ├── schema.prisma          # Modèle de données (§6)
        │   ├── migrations/
        │   └── seed.ts
        └── types/
```

---

## 6. Modèle de données (nœud magasin)

> **Source de vérité du schéma : `web/app/prisma/schema.prisma`.** Le tableau ci-dessous reflète le schéma **réel** (branche `feat/audit_refacto`). **Au niveau magasin, le schéma reste celui-ci** ; les clés d'agrégation (`magasinId`/`organisationId`) et les tables d'enrôlement vivent **au niveau cloud** (ADR-002, `docs/architecture-desktop/08-impacts-glossaire.md`).

### 6.1 Inventaire des modèles

| Modèle | Rôle | Notes saillantes |
|---|---|---|
| `User` + enum `Role` | Comptes & rôles (`ADMIN`, `MANAGER`, `CAISSIER`) | Mot de passe haché ; relations sessions/ventes/mouvements/logs |
| `Categorie` | Catégories produits | Couleur UI |
| `Produit` | Catalogue | `Produit.tva` = attribut **catalogue informatif**, **non** utilisé pour le calcul de taxe (modèle de **taxe globale**, voir `Taxe`) |
| `MouvementStock` + enum `TypeMouvement` | Mouvements de stock | `ENTREE/SORTIE/AJUSTEMENT/RETOUR/PERTE` ; lien optionnel `vente` |
| **`Caisse`** | Poste de caisse physique | `active` ; relation `mouvements` |
| `ComptoirSession` + enum `StatutSession` | Sessions de caisse | Workflow de clôture/validation à l'aveugle, écarts par mode, **hash d'intégrité** (`hashIntegrite`/`hashSessionPrecedente`), session corrective, fond d'ouverture (Lot G). Statuts : `OUVERTE`, `EN_ATTENTE_CLOTURE`, `EN_ATTENTE_VALIDATION`, `VALIDEE`, `CONTESTEE`, `FORCEE`, `CORRIGEE`, `FERMEE` (rétrocompat) |
| `MouvementCaisse` + enum `TypeMouvementCaisse` | Ledger de caisse | `FOND_INITIAL`, `FOND_OUVERTURE`, `LEVEE`, `VENTE`, `REMBOURSEMENT`, `APPORT`, `RETRAIT`, `DEPENSE`, `CORRECTION` ; rattaché à `caisseId`/`sessionId`/`auteurId` |
| `SeuilCaisse` | Seuils paramétrables | Seuils centralisés (Lot D) |
| **`EventCaisse`** | **Outbox** d'événements métier | `type`, `payload`, `consumed`, index `(consumed, createdAt)` → base du worker de sync (ADR-004 : purge à 30 j après accusé) |
| `Vente` + enum `StatutVente` | Ventes | `tva` + `taxesDetail` (taxe **globale**, M2) ; `VALIDEE/ANNULEE/REMBOURSEE` |
| `LigneVente` | Lignes de vente | Pas de taxation par-ligne (`tva` reste 0) |
| `Sequence` | Compteur transactionnel | Numérotation atomique des ventes (M3) ; clé ex. `VTE-2026` |
| `Paiement` | Paiements | `mode` = code (cf. `ModePaiementConfig`) |
| `Parametres` | Identité commerce | RCCM, NIF, logo ; relations `taxes`, `modesPaiement` |
| `ModePaiementConfig` | Modes de paiement configurables | `code` unique, `active`, `ordre` |
| `Taxe` | Taxes configurables | Modèle de **taxe globale** (taux appliqué à la base, M2) |
| `ActivityLog` | Journal d'audit | Append-only ; index sur action/acteur/entité/date |

### 6.2 Évolutions de schéma (migration desktop — livrées)

Évolutions livrées avec la migration desktop (statut au 2026-06-26) ; articulation : `08-impacts-glossaire.md`.

| Évolution | Niveau | Statut |
|---|---|---|
| `caisseId` sur `ComptoirSession` (multi-caisse, Lot C) — la caisse est désormais rattachée à la session ; unicité d'ouverture par caisse + caissier | Magasin | ☑ Livré |
| Numérotation **par poste** `VTE-<codePoste>-YYYY-NNNNN` (séquence par poste/année, `api/ventes/route.ts`) | Magasin | ☑ Livré |
| Hash d'intégrité **chaîné par caisse** (`lib/services/integrity.ts`) | Magasin | ☑ Livré |
| Outbox `EventCaisse` : horodatage de consommation + purge 30 j (ADR-004) | Magasin | ☑ Livré |
| Clés `magasinId` / `organisationId` + tables d'enrôlement, tokens, curseurs de sync (schéma cloud) | **Cloud** | ☑ Livré (`cloud/prisma/`) |

---

## 7. Architecture des modules (fonctionnel)

Les comportements réels (règles métier, écrans, validations, rôles) sont documentés **module par module** dans `docs/product/`. Synthèse des renvois :

| Module | Doc produit | Points clés |
|---|---|---|
| Authentification & rôles | `docs/product/01-auth-roles.md` | NextAuth v5 ; matrice de permissions `lib/permissions.ts` ; pas d'inscription publique |
| Stock | `docs/product/02-stock.md` | Produits, catégories, mouvements, alertes de rupture, transactions Prisma |
| Comptoir & ventes | `docs/product/03-comptoir-ventes.md` | POS, panier (Zustand), paiement multi-modes, **anti-survente atomique** (Lot B), annulation |
| Caisse & sessions | `docs/product/04-caisse-sessions.md` | Ouverture/clôture/validation à l'aveugle, écarts, fond de caisse & levée (Lot G), hash d'intégrité, session corrective |
| Impression & périphériques | `docs/product/05-impression-peripheriques.md` | Ticket PDF + ESC/POS, tiroir, douchette ; pont Electron (cible) |
| Dashboard & reporting | `docs/product/06-dashboard-reporting.md` | KPI, périmètre par rôle |
| Journal d'activité | `docs/product/07-journal-activite.md` | `logActivity()`, consultation filtrée |
| Taxes & paramètres | `docs/product/08-taxes-parametres.md` | Taxe globale (M2), modes de paiement, identité commerce |

**Flux de vente (résumé)** : Caisse (Electron) → UI POS servie par le nœud → `POST /api/ventes` au **nœud magasin** → transaction Prisma (création `Vente` + `LigneVente` + `Paiement`, décrément stock conditionnel atomique, `MouvementStock` SORTIE, `MouvementCaisse` VENTE, écriture `EventCaisse`) → réponse → impression locale (main Electron) + ouverture tiroir si espèces. La vente persiste **au magasin** ; l'impression/tiroir sont best-effort et ne rollback jamais la vente.

---

## 8. API Routes — endpoints

> **Référence exhaustive (dérivée du code), avec rôles et payloads : `docs/product/09-pages-api.md`.** Les routes sont servies par le **nœud magasin** et consommées par les caisses en LAN. Synthèse des familles :

| Famille | Base | Exemples |
|---|---|---|
| Auth | `/api/auth/[...nextauth]` | login NextAuth v5 |
| Utilisateurs (ADMIN) | `/api/users` | liste, création, détail, mise à jour, désactivation |
| Stock | `/api/produits`, `/api/categories`, `/api/stock/mouvements`, `/api/stock/alertes` | CRUD produits/catégories, mouvements, seuils |
| Comptoir | `/api/comptoir/sessions`, `/api/comptoir/sessions/[id]/closure`, `/.../validate` | ouverture, clôture, validation à l'aveugle |
| Caisse | `/api/caisse`, mouvements caisse | CRUD caisses (cible), fond/levée, apport/retrait/dépense |
| Ventes | `/api/ventes`, `/api/ventes/[id]`, `/api/ventes/[id]/annuler` | création, détail, annulation |
| Tickets | `/api/tickets/[id]/pdf`, `/api/tickets/[id]/print` | PDF, impression thermique |
| Tiroir | `/api/cash-drawer/open` | impulsion ESC/POS |
| Taxes & paramètres | `/api/taxes`, `/api/parametres` | taxe globale, modes de paiement, identité |
| Journal (ADMIN/MANAGER) | `/api/activity-logs` | liste paginée + filtres |
| Dashboard (ADMIN/MANAGER) | `/api/dashboard/kpis` | CA, ventes, panier moyen, alertes stock, séries |

**Conventions API** (cf. `CLAUDE.md` §4.3) : validation **Zod** avant Prisma, `try/catch`, erreurs `{ error, code? }`, succès `{ data, message? }`, transactions via `prisma.$transaction()`, vérification d'auth/rôle via `auth()` + `requireAuth`/`requireRole`/`hasPermission`.

---

## 9. Sécurité & rôles

### 9.1 Matrice de permissions (réelle — `web/app/src/lib/permissions.ts`)

L'autorisation repose sur `requireAuth()` (session valide), `requireRole(...)` et `hasPermission(role, permission)` sur la matrice `ROLE_PERMISSIONS`.

| Permission | ADMIN | MANAGER | CAISSIER |
|---|:--:|:--:|:--:|
| `users:manage` | ✅ | — | — |
| `stock:manage` | ✅ | ✅ | — |
| `comptoir:vendre` | ✅ | ✅ | ✅ |
| `comptoir:gerer_session_autre` | ✅ | ✅ | — |
| `comptoir:valider_session` | ✅ | ✅ | — |
| `comptoir:force_close` | ✅ | — | — |
| `comptoir:session_corrective` | ✅ | — | — |
| `comptoir:verifier_integrite` | ✅ | ✅ | — |
| `comptoir:mouvement_manuel` | ✅ | ✅ | ✅ |
| `comptoir:retrait_caisse` | ✅ | ✅ | — |
| `comptoir:depense` | ✅ | ✅ | — |
| `ventes:annuler` | ✅ | ✅ | — |
| `activity_logs:consulter` | ✅ | ✅ | — |
| `rapports:consulter` | ✅ | ✅ | — |
| `parametres:manage` | ✅ | — | — |

Détail (mécanismes, pages, niveau groupe vs PDV) : `docs/product/01-auth-roles.md`.

### 9.2 Sécurité dans la topologie 3 niveaux

- **Pas d'inscription publique** : création de comptes par `ADMIN` (à terme, autorité **cloud**, diffusion descendante — ADR-006).
- **Login servi par le magasin** : la caisse n'a **jamais** d'accès direct à MySQL ni de credentials DB.
- **Token de magasin** (caisse ↔ nœud) : secret scopé par poste, stocké en **trousseau OS**, longue durée + **révocation** (ADR-003). Transport HTTPS LAN ; mTLS différé V2.
- **Device token cloud** (nœud ↔ cloud) : rotation manuelle au renouvellement (ADR-003).
- **Cloud jamais sur le chemin critique** : la vente ne dépend pas du WAN.
- Ne jamais logger de données sensibles (mots de passe, tokens).

Détails : `docs/architecture-desktop/06-securite.md` et `09-adr.md`.

### 9.3 Niveau groupe vs niveau point de vente

Les rôles `ADMIN`/`MANAGER`/`CAISSIER` sont des comptes **niveau point de vente**. En V1 desktop, le **client Electron est réservé aux caissiers** (POS + périphériques) ; **admins et gérants utilisent l'application web** (stock, validation, écarts, ventes, utilisateurs, taxes, paramètres, journal, dashboards), servie par le nœud en LAN et/ou par le cloud. Les rôles **niveau groupe** (lecture consolidée multi-magasins) relèvent du cloud — voir `docs/architecture-desktop/01-modele-trois-niveaux.md` et `docs/product/01-auth-roles.md`.

---

## 10. Migration desktop — livrée (2026-06-26)

La migration de l'application web mono-base vers le système desktop à 3 niveaux est **livrée**. Synthèse des vagues :

```
V0 — Décisions & dérisquage   : ADR actés (09-adr.md) · PoC packaging Electron
V1 — Fondation métier magasin : caisseId/multi-caisse (Lot C) · numéro par poste · hash par caisse · outbox EventCaisse
V2 — Client Electron          : pont périphériques · coquille durcie · health-check + blocage
V3 — Enrôlement & identité    : 2 modes (nœud/client) · tokens trousseau OS · installation
V4 — Synchronisation cloud    : schéma cloud (cloud/prisma/) · worker push transactionnel · pull référence · résilience WAN
V5 — Packaging & exploitation : electron-builder 3 OS · auto-update · runbook sauvegardes (pas de HA)
```

Code : nœud magasin sous `web/app/` (logique multi-caisse, outbox, workers de sync), client Electron sous `desktop/`, schéma cloud sous `cloud/prisma/`. Exploitation : `docs/architecture-desktop/RUNBOOK.md`. Le backlog fonctionnel résiduel (hors desktop) est suivi dans `docs/product/README.md`.

---

## 11. Conteneurisation (nœud magasin)

Deux stacks Compose à la racine :

- **Développement** (`docker-compose.yml`) : services `db` (MySQL) + `phpmyadmin`. L'app Next est lancée en local (`npm run dev`) avec `DATABASE_URL` → conteneur MySQL.
- **Production** (`docker-compose.prod.yml`) : services `db` + `app` (image `Dockerfile`, sortie Next **standalone**) — le **nœud magasin** déployé localement dans le magasin.

Commandes, variables, réseau `db`, reverse proxy, migrations : `DOCKER.md`. Le client Electron (niveau 1) et le cloud (niveau 3) **ne sont pas** dans ces stacks (ADR-001 : le client n'embarque jamais le serveur).

---

*Architecture AerisPay v2.0 — modèle desktop 3 niveaux. Le QUOI : `docs/product/` · le COMMENT + ADR + exploitation : `docs/architecture-desktop/`.*
</content>
</invoke>
