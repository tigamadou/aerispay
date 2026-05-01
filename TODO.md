# AerisPay — TODO & suivi d'itération

> **Aligné sur :** `ROADMAP.md` **document v1.1.0** · Cible release code **MVP 1.0.0** (Phases 0–5)
> **Phase code en cours :** Phase 5 — Qualité & Déploiement
> **Dernière mise à jour :** 1 mai 2026
> **Prochain ticket :** PRINT-04 (QR code ticket) ou DASH-03 (rapport session PDF)
> **Contexte :** infrastructure Docker (Compose **à la racine**) ; code applicatif dans **`web/app/`** (voir `CLAUDE.md`).
> **Méthodologie :** **TDD obligatoire** — tests avant implémentation.
> **Matériel cible :** `SPECS/PERIPHERIQUES.md` · **Écrans / règles :** `SPECS/PAGES_MVP.md` · **Rôles :** `SPECS/AUTH.md`

---

## Versionnement (rappel)

| Élément | Version | Rôle |
|---------|---------|------|
| **Documentation** (`SPECS/`, `ROADMAP`, `TODO`, `ARCHITECTURE_MVP`…) | **1.1.0** | Spécifications stabilisées pour l'implémentation MVP. |
| **Application (code)** | **→ 1.0.0** (à taguer) | Objectif : fin de Phase 5 (Qualité & déploiement). |
| **Produit > MVP** | **2.x+** | Multi-org, etc. : `SPECS/MULTI_ORGANISATION.md` |

---

## Structure du dépôt

| Emplacement | Contenu |
|-------------|--------|
| **Racine** | Docs : `ARCHITECTURE_MVP.md`, `CLAUDE.md`, `SPECS/` (dont `PAGES_MVP`, `AUTH`, `MULTI_ORGANISATION`…), `ROADMAP.md`, `CONVENTIONS.md`, `DOCKER.md`, `README.md` ; `docker-compose*.yml` |
| **`web/`** | `Dockerfile`, `development.env.example`, `production.env.example` |
| **`web/app/`** | Next.js, `package.json`, Prisma, `app/`, `lib/`, `components/`, etc. |

**Règles :** `docker compose` depuis la **racine** ; `npm` / `npx` / Prisma depuis **`web/app/`** ; chemins de tickets côté code = relatifs à **`web/app/`** sauf mention inverse.

**TDD :** chaque ticket = tests d'abord (Vitest / RTL / Playwright selon le périmètre).

---

## Documentation livrée (v1.1.0) — ne pas re-traiter comme code

Ces éléments sont considérés **à jour** pour le MVP et les jalons v2+ documentés — les évolutions se font par **nouvelle version** de spec (`ROADMAP` / champs *Version* en tête de fichier) :

- [x] `ARCHITECTURE_MVP.md` — schéma, endpoints, rôles §8
- [x] `SPECS/` — STOCK, COMPTOIR, AUTH (2 niveaux groupe/PDV), IMPRESSION, ACTIVITY_LOG, PERIPHERIQUES, **MULTI_ORGANISATION**, **PAGES_MVP**, **DASHBOARD** (KPI)
- [x] `CLAUDE.md`, `CONVENTIONS.md`, `DOCKER.md`
- [x] Stack Docker (Compose racine, app sous `web/app/`)
- [x] `ROADMAP.md` v1.1.0 (versionnement + phases **1.0.0** / backlog **2.x+**)

> Toute modification de spec hors ticket explicite : incrémenter le **versionnement document** (ex. 1.1.0 → 1.2.0) dans l'en-tête du fichier concerné et `ROADMAP` si besoin.

---

## En cours

_Phases 0–4 terminées — reste quelques tickets Phase 3/4 mineurs + Phase 5 (Qualité & Déploiement)_

---

## Terminé — Phase 0 (Fondations)

- [x] **SETUP-00** — Docker (stack locale MySQL + phpMyAdmin)
- [x] **SETUP-01** — Initialisation Next.js 14 dans `web/app/`
- [x] **SETUP-02** — Configuration Prisma + MySQL (schéma complet, migrations)
- [x] **SETUP-03** — Authentification NextAuth.js v5
  - [x] Login / logout ; session avec rôle ; protection routes
  - [x] Seul `ADMIN` gère les comptes (403 sinon)
  - [x] API Routes : `GET/POST /api/users`, `GET/PUT/DELETE /api/users/[id]` — ADMIN only
  - [x] Pages : `/users` (liste), `/users/nouveau` (création), `/users/[id]` (édition)
  - [x] Rôles & permissions : `lib/permissions.ts` (hasPermission, hasRole, requireAuth, requireRole)
  - [x] Navigation conditionnelle par rôle dans le layout dashboard
  - [x] Seed : 3 comptes (ADMIN, MANAGER, CAISSIER)
- [x] **SETUP-04** — Layout principal (dashboard)
  - [x] Navigation conditionnelle par rôle (Stock, Comptoir, Utilisateurs, Journal, Parametres, Taxes)
  - [x] Header avec identité utilisateur + déconnexion
- [x] **SETUP-05** — Seed de base de données
  - [x] 3 comptes (ADMIN, MANAGER, CAISSIER)
  - [x] 5 catégories + 19 produits (avec alertes stock et ruptures)
- [x] **SETUP-06** — Compatibilité matériel caisse
  - [x] Abstractions serveur (thermal-printer.ts, cash-drawer)
  - [x] Config env `PRINTER_*` / `CASH_DRAWER_*`
  - [x] Tests automatisables (mocks)

---

## Terminé — Phase 1 (Stock)

- [x] **STOCK-API-01** — `GET/POST /api/produits` (liste paginée, filtres, création)
- [x] **STOCK-API-02** — `GET/PUT/DELETE /api/produits/[id]`
- [x] **STOCK-API-03** — `GET/POST /api/categories` + `GET/PUT/DELETE /api/categories/[id]`
- [x] **STOCK-API-04** — `GET/POST /api/stock/mouvements` (ENTREE, SORTIE, AJUSTEMENT, RETOUR, PERTE)
- [x] **STOCK-API-05** — `GET /api/stock/alertes`
- [x] **STOCK-UI-01** — Page liste produits `/stock` (grille + tableau, recherche, filtres, pagination)
- [x] **STOCK-UI-02** — Formulaire création/édition `/stock/nouveau`, `/stock/[id]`
- [x] **STOCK-UI-03** — Page catégories `/stock/categories`
- [x] **STOCK-UI-04** — Page mouvements `/stock/mouvements` (filtres, détails)
- [x] **STOCK-UI-05** — Widget alertes sur le dashboard

---

## Terminé — Phase 2 (Comptoir / Ventes)

- [x] **CAISSE-API-01** — `GET/POST /api/comptoir/sessions` (ouverture session, activity log)
- [x] **CAISSE-API-02** — `GET/PUT /api/comptoir/sessions/[id]` (fermeture session)
- [x] **CAISSE-UI-01** — Page sessions `/comptoir/sessions`
- [x] **CAISSE-UI-02** — Interface POS `/comptoir` (grille produits, recherche/scanner code-barres, filtre catégorie)
- [x] **CAISSE-UI-03** — Composant Cart (Zustand store avec remise, taxes, persist sessionStorage)
- [x] **CAISSE-UI-04** — PaymentModal (modes : especes, mobile money)
- [x] **CAISSE-API-03** — `POST /api/ventes` (transaction atomique : vente + lignes + paiements + stock + mouvements)
- [x] **CAISSE-API-04** — `GET /api/ventes`, `GET /api/ventes/[id]`
- [x] **CAISSE-API-05** — `POST /api/ventes/[id]/annuler` (ADMIN/MANAGER, restauration stock)
- [x] **CAISSE-UI-05** — Page historique `/comptoir/ventes` + détail `/comptoir/ventes/[id]`

---

## Terminé — Phase 3 (Impression & matériel)

- [x] **PRINT-01** — `lib/receipt/pdf-generator.tsx` (en-tête commerce, RCCM/NIF, lignes, taxes, paiements, pied de page)
- [x] **PRINT-02** — `GET /api/tickets/[id]/pdf` (téléchargement PDF avec activity log)
- [x] **PRINT-03** — Page `/comptoir/tickets/[id]` (prévisualisation ticket HTML)
- [x] **PRINT-05** — `lib/receipt/thermal-printer.ts` (config env, fallback gracieux, tiroir-caisse)
- [x] **PRINT-06** — `POST /api/tickets/[id]/print` (impression thermique avec activity log)
- [x] **PRINT-07** — `TicketActions.tsx` (boutons impression PDF / thermique post-vente)
- [x] **PRINT-08** — `POST /api/cash-drawer/open` (impulsion ESC/POS)

### Reste Phase 3

- [ ] **PRINT-04** — QR code sur ticket (mentionné dans specs, non implémenté)
- [ ] **POS-HW-01** — Validation matériel (checklist manuelle + tests terrain)
- [ ] **thermal-printer `printReceipt()`** — le stub existe mais le contenu du reçu n'est pas construit depuis les données de vente

---

## Terminé — Phase 4 (Dashboard & Rapports)

- [x] **DASH-01** — `GET /api/dashboard/kpis` (CA, nombre ventes, panier moyen, especes vs autre, alertes stock, status périphériques)
- [x] **DASH-02** — Page dashboard `/` (cartes KPI, alertes stock, top 5 stock bas ; vue CAISSIER allégée)
- [x] **LOG-01** — Modèle `ActivityLog` + `logActivity()` (45+ types d'actions, capture IP/user-agent)
- [x] **LOG-02** — Instrumentation `logActivity` (auth, users, stock, comptoir, tickets, taxes, parametres)
- [x] **LOG-03** — `GET /api/activity-logs` + page `/activity-logs` + détail `/activity-logs/[id]` (filtres, pagination, badges actions, IP pour ADMIN)

### Reste Phase 4

- [ ] **DASH-03** — Rapport journalier session (PDF)
- [ ] **DASH-04** — Export inventaire CSV

---

## Extra (hors roadmap initiale, déjà implémenté)

- [x] **Taxes** — Modèle `Taxe`, CRUD API (`/api/taxes`), page `/taxes`, intégration POS + PDF
- [x] **Parametres** — Modèle `Parametres`, API (`/api/parametres`), page `/parametres` (nom, adresse, RCCM, NIF, logo)
- [x] **Upload** — `POST /api/upload` (images produits/logo)
- [x] **Validations Zod** — 8 schemas (produit, vente, session, mouvement, categorie, parametres, taxe, user)

---

## A faire — Phase 5 (Qualité & Déploiement) — cible **MVP 1.0.0**

- [ ] **QA-01** — Vitest API — couverture >= 80 % (27 fichiers de tests existants, à compléter)
- [ ] **QA-02** — RTL — composants critiques (Cart, PaymentModal, ProductForm, POSInterface)
- [ ] **QA-03** — Cypress e2e — compléter les parcours (7 specs existants : login, users, sessions, ventes, tickets, activity-logs, taxes)
- [ ] **QA-04** — TDD : traçabilité tests <-> features
- [ ] **QA-05** — Lighthouse >= 90
- [ ] **QA-06** — Relecture sécurité (OWASP)
- [ ] **DEPLOY-01** — `docker-compose.prod.yml` + `web/Dockerfile` — `DOCKER.md`
- [ ] **DEPLOY-02** — Variables production + secrets
- [ ] **DEPLOY-03** — Cible d'hébergement (Vercel / VPS / autre)
- [ ] **DEPLOY-04** — Monitoring (logs, uptime)

**Lorsque Phase 5 est validée :** tag de release applicative **v1.0.0**.

---

## Rappel Docker (résumé)

- **Dev :** `docker compose up -d` (racine) — cf. `DOCKER.md`.
- **Prod :** `docker compose -f docker-compose.prod.yml ...` ; build contexte `web/app/`, `web/Dockerfile`.
- **Imprimante :** préférence **réseau** ESC/POS en conteneur ; USB = complexe (voir `PERIPHERIQUES`).

---

## Terminé (hors code — traçabilité)

- [x] Architecture & roadmap versionnée (**doc 1.1.0** / cible app **1.0.0**)
- [x] Specs MVP complètes + `PAGES_MVP` + `MULTI_ORGANISATION` + rôles `AUTH`
- [x] Fichiers Compose + doc Docker alignés `web/app/`
- [x] SETUP-00 à SETUP-06 : Docker, Next.js, Prisma, Auth, Users, Layout, Seed, Matériel
- [x] CI GitHub Actions (lint + unit tests + e2e)

---

## Instructions agent (raccourci)

1. Lire `CLAUDE.md`
2. Coder dans **`web/app/`**
3. Docker / DB : racine puis `web/app/` pour Prisma & Next
4. **Premier ticket ouvert** : voir section "Reste Phase 3/4" ou "Phase 5"
5. Spec : module + `PAGES_MVP` si UI
6. **Tests d'abord**
7. `CONVENTIONS.md`
8. Cocher la tâche, passer au ticket suivant

---

*TODO — **v1.1.0** — 1 mai 2026 · Cible **MVP 1.0.0** = fin Phase 5 (`ROADMAP.md`).*
