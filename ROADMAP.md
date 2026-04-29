# AerisPay — Roadmap de Développement

> **Méthodologie :** Sprints de 1 semaine · Chaque tâche = 1 ticket agent IA · **TDD obligatoire**  
> **Statuts :** `[ ]` À faire · `[→]` En cours · `[x]` Terminé · `[!]` Bloqué

---

## Versionnement

| Artefact | Version | Description |
|----------|---------|-------------|
| **Documentation produit** (`SPECS/`, `PAGES_MVP`, `ARCHITECTURE_MVP`, etc.) | **1.1.0** | Specs alignées : pages MVP, rôles groupe/PDV (`AUTH`), multi-organisation, périphériques, Docker racine, `web/app/`. |
| **Release applicative cible (MVP)** | **1.0.0** | Livrable code : Phases 0 → 5 ci-dessous (non tagué tant que les critères de Phase 5 ne sont pas remplis). |
| **Versions futures (hors MVP)** | **2.x+** | Backlog en fin de document (multi-boutiques, RH, compta…). |

**Index des specs MVP (v1.1.0 doc) :** `SPECS/PAGES_MVP.md` (inventaire des écrans) ; `SPECS/DASHBOARD.md` (KPI & `GET /api/dashboard/kpis`) ; `SPECS/AUTH.md` ; `SPECS/STOCK.md` ; `SPECS/CAISSE.md` ; `SPECS/IMPRESSION.md` ; `SPECS/PERIPHERIQUES.md` ; `SPECS/ACTIVITY_LOG.md` ; `SPECS/MULTI_ORGANISATION.md` (cible long terme).

---

## Vue d'Ensemble

```
v1.0.0 (MVP code) — Phases 0 → 5
────────────────────────────────
Phase 0 — Fondations (Semaine 1)
  └─ Setup projet (web/app/), DB, auth, layout de base

Phase 1 — Module Stock (Semaines 2–3)
  └─ CRUD produits, catégories, mouvements, alertes

Phase 2 — Module Caisse (Semaines 4–5)
  └─ Interface POS, ventes, paiements, sessions, douchette code-barres, tiroir-caisse

Phase 3 — Impression (Semaine 6)
  └─ Tickets PDF normalisés + imprimante thermique ESC/POS

Phase 4 — Dashboard & Rapports (Semaine 7)
  └─ KPIs, graphiques, exports, journal d’activité (LOG-01…03)

Phase 5 — Qualité & Déploiement (Semaine 8)
  └─ Tests, optimisations, mise en production

v2.x+ (hors MVP 1.0.0) — jalons produit
──────────────────────────────────────
Phase 6+ — Multi-organisation
  └─ Voir `SPECS/MULTI_ORGANISATION.md` (multi-PDV, base locale, sauvegarde en ligne, accès distants, rôles réseau)
```

---

## Règle TDD

Chaque fonctionnalité de cette roadmap se développe en **tests d’abord** : écrire les tests Vitest, React Testing Library ou Playwright qui décrivent le comportement attendu, les faire échouer si possible, puis implémenter le code jusqu’à ce qu’ils passent. Les critères de succès incluent toujours les tests ciblés du ticket, même si la ligne ne le répète pas explicitement.

**Référence écrans / règles par page :** `SPECS/PAGES_MVP.md` (version **1.1.0** doc, alignée sur le MVP **1.0.0**).

---

## Phase 0 — Fondations du Projet

**Objectif :** Avoir un projet Next.js fonctionnel avec auth et layout de base.  
**Critère de succès :** Un utilisateur peut se connecter et voir un dashboard vide.  
**Livraison cible :** version **1.0.0** (MVP) — *sous-ensemble* Phase 0 seul ne constitue pas la release complète.

### Sprint 0.1 — Initialisation
- [ ] **[SETUP-01]** Créer le projet Next.js 14 avec TypeScript, Tailwind, App Router  
  - Emplacement : **`web/app/`** (voir `CLAUDE.md`, `TODO.md`)  
  - `npx create-next-app@latest` (ou équivalent) avec `--src-dir` si retenu  
  - Installer les dépendances : shadcn/ui, Prisma, NextAuth, Zod, etc.  
  - Configurer ESLint + Prettier + `.editorconfig`  
  - _Critère :_ `npm run dev` (depuis `web/app/`) démarre sans erreur

- [ ] **[SETUP-02]** Configurer Prisma + MySQL  
  - Démarrer la base : `docker compose up -d` depuis la **racine** (`docker-compose.yml`, MySQL + phpMyAdmin) ; `web/development.env.example` → `.env` racine, `web/app/.env.local` pour l’hôte  
  - `npx prisma init` (depuis `web/app/`)  
  - Schéma : `prisma/schema.prisma` selon `ARCHITECTURE_MVP.md`  
  - Première migration : `npx prisma migrate dev --name init`  
  - _Critère :_ `npx prisma studio` affiche toutes les tables

- [ ] **[SETUP-03]** Configurer NextAuth.js v5  
  - Credentials provider (email + mot de passe hashé bcrypt)  
  - Session avec rôle utilisateur inclus  
  - **Pas d’inscription publique** ; création de comptes réservée à l’`ADMIN` **du point de vente** (`/api/users`, `/users` — `SPECS/AUTH.md`)  
  - Middleware de protection des routes dashboard  
  - _Critère :_ Login/logout fonctionnel, seul un `ADMIN` peut gérer les comptes utilisateurs du site

- [ ] **[SETUP-04]** Layout principal (Sidebar + Navbar)  
  - Navigation : `SPECS/PAGES_MVP.md` + entrées conditionnelles (`Utilisateurs` → `ADMIN` ; `Journal d’activité` → `ADMIN` + `MANAGER`)  
  - Navbar : utilisateur connecté + déconnexion  
  - `KPICard` réutilisable  
  - _Critère :_ Layout desktop / tablette OK

- [ ] **[SETUP-05]** Seed de base de données  
  - 1 `ADMIN`, 1 `MANAGER`, 1 `CAISSIER` (cf. `SPECS/AUTH.md`)  
  - 5 catégories, 20 produits, barcodes de test  
  - _Critère :_ `npx prisma db seed` OK

- [ ] **[SETUP-06]** Périmètre matériel caisse (abstractions, tests, config env)  
  - `SPECS/PERIPHERIQUES.md` · alignement `CAISSE` / `IMPRESSION`  
  - _Critère :_ comportements de base testés (mocks) ; doc env `PRINTER_*` / `CASH_DRAWER_*` comprise

---

## Phase 1 — Module Gestion de Stock

**Objectif :** CRUD complet des produits et gestion des mouvements de stock.  
**Critère de succès :** Un `MANAGER` ou `ADMIN` peut gérer l’intégralité du stock (les `CAISSIER` : lecture liste selon `PAGES_MVP` / `AUTH`).

**Specs :** `SPECS/STOCK.md`, `SPECS/PAGES_MVP.md` (section Stock).

### Sprint 1.1 — API Stock
- [ ] **[STOCK-API-01]** API `GET/POST /api/produits`
- [ ] **[STOCK-API-02]** API `GET/PUT/DELETE /api/produits/[id]`
- [ ] **[STOCK-API-03]** API `GET/POST /api/categories`
- [ ] **[STOCK-API-04]** API `GET/POST /api/stock/mouvements`
- [ ] **[STOCK-API-05]** API `GET /api/stock/alertes`

### Sprint 1.2 — Interface Stock
- [ ] **[STOCK-UI-01]** Page liste des produits (`/stock`) — *PAGES_MVP*
- [ ] **[STOCK-UI-02]** Formulaire création/édition (`/stock/nouveau`, `/stock/[id]`) — *PAGES_MVP*
- [ ] **[STOCK-UI-03]** Page catégories (`/stock/categories`) — *PAGES_MVP*
- [ ] **[STOCK-UI-04]** Page mouvements (`/stock/mouvements`) — *PAGES_MVP*
- [ ] **[STOCK-UI-05]** Widget alertes sur le dashboard (`/`)

---

## Phase 2 — Module Gestion de Caisse (POS)

**Objectif :** Vente de bout en bout.  
**Critère de succès :** Un caissier ouvre une session, vend (scan, paiement), ticket + matériel selon `PERIPHERIQUES`.

**Specs :** `SPECS/CAISSE.md`, `SPECS/PERIPHERIQUES.md`, `SPECS/PAGES_MVP.md` (Caisse).

### Sprint 2.1 — Sessions de Caisse
- [ ] **[CAISSE-API-01]** API `GET/POST /api/caisse/sessions`
- [ ] **[CAISSE-API-02]** API `PUT /api/caisse/sessions/[id]`
- [ ] **[CAISSE-UI-01]** Page sessions (`/caisse/sessions`)

### Sprint 2.2 — Interface POS
- [ ] **[CAISSE-UI-02]** Interface POS (`/caisse`)
- [ ] **[CAISSE-UI-03]** Composant `Cart` (Zustand)
- [ ] **[CAISSE-UI-04]** `PaymentModal`

### Sprint 2.3 — Logique de Vente
- [ ] **[CAISSE-API-03]** API `POST /api/ventes`
- [ ] **[CAISSE-API-04]** API `GET /api/ventes`, `GET /api/ventes/[id]`
- [ ] **[CAISSE-API-05]** API `PUT /api/ventes/[id]/annuler`
- [ ] **[CAISSE-UI-05]** Page historique (`/caisse/ventes`)

---

## Phase 3 — Impression des Tickets

**Objectif :** PDF + thermique + tiroir.  
**Specs :** `SPECS/IMPRESSION.md`, `SPECS/PERIPHERIQUES.md`, `PAGES_MVP` (`/caisse/tickets/[id]`).

### Sprint 3.1 — Ticket PDF
- [ ] **[PRINT-01]** `lib/receipt/pdf-generator.ts`
- [ ] **[PRINT-02]** `GET /api/tickets/[id]/pdf`
- [ ] **[PRINT-03]** Page `/caisse/tickets/[id]`
- [ ] **[PRINT-04]** QR code ticket

### Sprint 3.2 — Impression Thermique
- [ ] **[PRINT-05]** `lib/receipt/thermal-printer.ts`
- [ ] **[PRINT-06]** `POST /api/tickets/[id]/print`
- [ ] **[PRINT-07]** Bouton impression post-vente (UI POS)
- [ ] **[PRINT-08]** Tiroir-caisse + `POST /api/cash-drawer/open` si spécifié
- [ ] **[POS-HW-01]** Validation matériel (checklist manuelle + tests automatisables)

---

## Phase 4 — Dashboard & Rapports

**Objectif :** KPIs (liste **`SPECS/DASHBOARD.md`**), exports, **journal d’activité** complet.  
**Specs :** `SPECS/DASHBOARD.md`, `PAGES_MVP` (Dashboard, `activity-logs`), `ACTIVITY_LOG.md`, `ARCHITECTURE_MVP` §7–8.

- [ ] **[DASH-01]** `GET /api/dashboard/kpis` — contrat, agrégations et filtres rôle : `DASHBOARD.md` §6
- [ ] **[DASH-02]** Page dashboard (`/`) — cartes KPI-01…07, graphique KPI-08, top 5 KPI-09, aperçu stock KPI-10 ; vue `CAISSIER` §5
- [ ] **[DASH-03]** Rapport journalier session (PDF)
- [ ] **[DASH-04]** Export inventaire CSV
- [ ] **[LOG-01]** Modèle `ActivityLog` + `logActivity` (`ACTIVITY_LOG.md`) — *idéalement tôt (instrumentation transverse) ; sinon LOG-02 en rattrapage*
- [ ] **[LOG-02]** Instrumentation `logActivity` (auth, users, stock, caisse, tickets)
- [ ] **[LOG-03]** `GET /api/activity-logs` + page `/activity-logs`

---

## Phase 5 — Qualité & Déploiement

**Objectif :** Stabiliser et livrer **MVP 1.0.0** (release applicative).

- [ ] **[QA-01]** Vitest API — couverture ≥ 80 % (cible)
- [ ] **[QA-02]** RTL — composants critiques
- [ ] **[QA-03]** Playwright — parcours vente + impression + scan simulé
- [ ] **[QA-04]** TDD : traçabilité tests ↔ features
- [ ] **[QA-05]** Lighthouse ≥ 90 (cible)
- [ ] **[QA-06]** Relecture sécurité (OWASP)
- [ ] **[DEPLOY-01]** `docker-compose.prod.yml` + `web/Dockerfile` — `DOCKER.md`
- [ ] **[DEPLOY-02]** Variables production + secrets
- [ ] **[DEPLOY-03]** Cible d’hébergement (Vercel / VPS / autre)
- [ ] **[DEPLOY-04]** Monitoring (logs, uptime)

**Lorsque Phase 5 est validée :** tag de release applicative **v1.0.0** (conventionnel).

---

## Backlog — Versions futures (produit > 1.0.0)

Ces blocs **ne font pas partie du MVP 1.0.0** ; la documentation d’intention est déjà partiellement dans `SPECS/`.

| Version cible | Thème | Références |
|---------------|--------|------------|
| **v1.1** | Rapports avancés, alertes email, etc. | ROADMAP historique v1.1 fun. |
| **v2.0** | Gestion RH | (à détailler) |
| **v3.0** | Comptabilité | (à détailler) |
| **v4.0** | Multi-boutiques & gouvernance de structure | `SPECS/MULTI_ORGANISATION.md` |

### v1.1 (produit) — Rapports avancés
- Rapport mensuel comparatif, tendances stock, alertes email rupture

### v2.0 — Gestion RH
- Fiche employé, plannings, présences, paie

### v3.0 — Comptabilité Générale
- Plan comptable, grand livre, TVA, etc.

### v4.0 — Multi-boutiques & gouvernance
- `SPECS/MULTI_ORGANISATION.md` (multi-PDV, rôles réseau, sauvegarde, accès distants, scopage `magasin` / `organisation`).

---

*AerisPay Roadmap — **Document v1.1.0** — Avril 2026 · Cible release applicative : **MVP 1.0.0** (Phases 0–5).*
