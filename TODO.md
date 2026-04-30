# AerisPay — TODO & suivi d’itération

> **Aligné sur :** `ROADMAP.md` **document v1.1.0** · Cible release code **MVP 1.0.0** (Phases 0–5)  
> **Phase code en cours :** Phase 0 — Fondations
> **Dernière mise à jour :** 30 avril 2026
> **Prochain ticket :** SETUP-04  
> **Contexte :** infrastructure Docker (Compose **à la racine**) ; code applicatif dans **`web/app/`** (voir `CLAUDE.md`).  
> **Méthodologie :** **TDD obligatoire** — tests avant implémentation.  
> **Matériel cible :** `SPECS/PERIPHERIQUES.md` · **Écrans / règles :** `SPECS/PAGES_MVP.md` · **Rôles :** `SPECS/AUTH.md`

---

## Versionnement (rappel)

| Élément | Version | Rôle |
|---------|---------|------|
| **Documentation** (`SPECS/`, `ROADMAP`, `TODO`, `ARCHITECTURE_MVP`…) | **1.1.0** | Spécifications stabilisées pour l’implémentation MVP. |
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

**TDD :** chaque ticket = tests d’abord (Vitest / RTL / Playwright selon le périmètre).

---

## Documentation livrée (v1.1.0) — ne pas re-traiter comme code

Ces éléments sont considérés **à jour** pour le MVP et les jalons v2+ documentés — les évolutions se font par **nouvelle version** de spec (`ROADMAP` / champs *Version* en tête de fichier) :

- [x] `ARCHITECTURE_MVP.md` — schéma, endpoints, rôles §8  
- [x] `SPECS/` — STOCK, CAISSE, AUTH (2 niveaux groupe/PDV), IMPRESSION, ACTIVITY_LOG, PERIPHERIQUES, **MULTI_ORGANISATION**, **PAGES_MVP**, **DASHBOARD** (KPI)  
- [x] `CLAUDE.md`, `CONVENTIONS.md`, `DOCKER.md`  
- [x] Stack Docker (Compose racine, app sous `web/app/`)  
- [x] `ROADMAP.md` v1.1.0 (versionnement + phases **1.0.0** / backlog **2.x+**)

> Toute modification de spec hors ticket explicite : incrémenter le **versionnement document** (ex. 1.1.0 → 1.2.0) dans l’en-tête du fichier concerné et `ROADMAP` si besoin.

---

## En cours

_Prêt à démarrer SETUP-04 (Layout principal)_

---

## À faire — Phase 0 (Fondations) — cible **MVP 1.0.0**

### ~~SETUP-00 — Prérequis : Docker (stack locale)~~ ✅

### ~~SETUP-01 — Initialisation du projet Next.js dans `web/app/`~~ ✅

### ~~SETUP-02 — Configuration Prisma + MySQL~~ ✅

### ~~SETUP-03 — Authentification NextAuth.js v5~~ ✅
- [x] Login / logout ; session avec rôle ; protection routes
- [x] Seul `ADMIN` gère les comptes (403 sinon)
- [x] Tests auth / permissions (82 tests passent)
- [x] API Routes : `GET/POST /api/users`, `GET/PUT /api/users/[id]` — ADMIN only
- [x] Pages : `/users` (liste), `/users/nouveau` (création), `/users/[id]` (édition)
- [x] Rôles & permissions : `lib/permissions.ts` (hasPermission, hasRole, requireAuth, requireRole)
- [x] Navigation conditionnelle par rôle dans le layout dashboard
- [x] Seed : 3 comptes (ADMIN, MANAGER, CAISSIER)

---

### SETUP-04 — Layout principal (dashboard)
**Assigné à :** Agent  
**Priorité :** Haute  
**Dépend de :** SETUP-03  
**Spec :** `SPECS/PAGES_MVP.md` §0 (sidebar : Utilisateurs si `ADMIN` ; Journal si `ADMIN` / `MANAGER`)

**Fichiers :** `app/(dashboard)/layout.tsx`, `components/shared/Sidebar.tsx`, `Navbar.tsx`, `KPICard.tsx`, `app/(dashboard)/page.tsx` (accueil minimal).

**Critères d'acceptation :**
- [ ] Navigation conditionnelle par rôle ; responsive  
- [ ] Bienvenue + déconnexion

---

### SETUP-05 — Seed de base de données
**Assigné à :** Agent  
**Priorité :** Haute  
**Dépend de :** SETUP-02  
**Spec :** `SPECS/AUTH.md` (rôles) · `SPECS/STOCK.md` (données de test)

**Données :** 1 compte `ADMIN`, 1 `MANAGER`, 1 `CAISSIER` ; 5 catégories ; 20 produits (certains en alerte) ; codes-barres sur une partie des produits.

**Critère :** `npx prisma db seed` OK ; les 3 comptes se connectent.

---

### SETUP-06 — Compatibilité matériel caisse
**Assigné à :** Agent  
**Priorité :** Haute (peut suivre un premier jet de caisse)  
**Dépend de :** SETUP-01 min.  
**Specs :** `SPECS/PERIPHERIQUES.md` (principal), `SPECS/CAISSE.md`, `SPECS/IMPRESSION.md`, `SPECS/STOCK.md`

**Instructions :** TDD d’abord (scan, print, tiroir) ; abstractions serveur ; erreurs matériel n’annulent pas une vente validée.

**Critères d'acceptation :** alignés `PERIPHERIQUES` + `IMPRESSION` (imprimante réseau, tiroir, douchette HID, messages d’erreur, tests automatisables).

---

## Phases 1–5 (rappel)

Ordre et identifiants de tickets : **voir `ROADMAP.md`** (STOCK-*, CAISSE-*, PRINT-*, DASH-*, LOG-*, QA-*, DEPLOY-*). Chaque lot doit respecter `PAGES_MVP` + spec module.

| Phase | Contenu synthétique | Version cible |
|--------|----------------------|---------------|
| 1 | Stock | 1.0.0 |
| 2 | Caisse / ventes | 1.0.0 |
| 3 | Impression & matériel | 1.0.0 |
| 4 | Dashboard, activity logs | 1.0.0 |
| 5 | Qualité, déploiement, **tag v1.0.0** | 1.0.0 release |

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
- [x] SETUP-00 à SETUP-03 : Docker, Next.js, Prisma, Auth, Users management, Rôles & permissions
- [x] CI GitHub Actions (lint + unit tests + e2e)

---

## Instructions agent (raccourci)

1. Lire `CLAUDE.md`  
2. Coder dans **`web/app/`**  
3. Docker / DB : racine puis `web/app/` pour Prisma & Next  
4. **Premier ticket ouvert** : SETUP-00 → … (ordre `ROADMAP` / section ci-dessus)  
5. Spec : module + `PAGES_MVP` si UI  
6. **Tests d’abord**  
7. `CONVENTIONS.md`  
8. Cocher la tâche, passer au ticket suivant  

---

*TODO — **v1.1.0** — 29 avril 2026 · Cible **MVP 1.0.0** = fin Phase 5 (`ROADMAP.md`).*
