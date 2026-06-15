# AerisPay — Audit Complet & Plan de Refactorisation

> **Date de lancement :** 4 mai 2026
> **Branche :** `development`
> **Approche :** C — Audit parallele → Plan unifie → Execution par vague
> **Statut global :** TERMINE — Toutes les vagues completees

---

## Table des matieres

1. [Contexte & Objectifs](#1-contexte--objectifs)
2. [Vague 0 — Audit parallele (4 agents)](#2-vague-0--audit-parallele)
3. [Vague 1 — Consolidation & Plan d'execution](#3-vague-1--consolidation--plan-dexecution)
4. [Vague 2 — Corrections critiques (P0 + P1)](#4-vague-2--corrections-critiques)
5. [Vague 3 — Refactorisations & couverture (P2 + P3)](#5-vague-3--refactorisations--couverture)
6. [Vague 4 — Revue finale](#6-vague-4--revue-finale)
7. [Suivi d'avancement](#7-suivi-davancement)
8. [Fichiers de rapports](#8-fichiers-de-rapports)
9. [Instructions de reprise](#9-instructions-de-reprise)

---

## 1. Contexte & Objectifs

### Etat du projet au lancement

- **Phases 0-4 terminees**, Phase 5 (Qualite & Deploiement) en cours
- **68 fichiers source** (pages + API routes)
- **51 fichiers tests Vitest** + **13 specs Cypress e2e**
- **5 services metier** dans `lib/services/` (cash-movement, event-emitter, integrity, reconciliation, seuils)
- **10 documents SPECS** + modules hors roadmap initiale (`caisse/`, `discrepancies/`, `ecarts/`, `modes-paiement`)

### Objectifs

1. **Audit complet** de la logique metier, securite, tests et qualite code
2. **Plan d'execution priorise** : critique d'abord, refactorisations ensuite
3. **Execution complete** avec TDD obligatoire et revue finale
4. **Cible finale** : tag v1.0.0 avec couverture >= 80%, 0 faille critique ouverte

### Decisions prises

| Question | Choix |
|----------|-------|
| Objectif principal | Audit complet + execution (stabilisation + refonte qualitative) |
| Perimetre securite | OWASP + infrastructure + pentest simule |
| Autonomie agents | Audit + execution complete, revue finale utilisateur |
| Priorite tests | Flux financiers d'abord |
| Approche | C — Audit parallele → Plan unifie → Execution par vague |

---

## 2. Vague 0 — Audit parallele

> **Statut :** TERMINE
> **Agents :** 4 en parallele

### Agent 1 : Audit Logique Metier & Financier

- **Statut :** [x] TERMINE
- **Rapport :** [`rapports/01-logique-metier.md`](rapports/01-logique-metier.md)

**Perimetre :**
- Toutes les API Routes transactionnelles :
  - `POST /api/ventes` — creation de vente (transaction atomique)
  - `POST /api/ventes/[id]/annuler` — annulation + restauration stock
  - `POST /api/comptoir/sessions` — ouverture session
  - `PUT /api/comptoir/sessions/[id]` — fermeture session
  - `POST /api/stock/mouvements` — mouvements de stock
  - `POST /api/comptoir/sessions/[id]/closure` — cloture caisse
  - `POST /api/comptoir/sessions/[id]/validate` — validation session
  - `POST /api/comptoir/sessions/[id]/correct` — correction session
  - `POST /api/comptoir/sessions/[id]/force-close` — fermeture forcee
  - `POST /api/caisse/[id]/mouvements` — mouvements de caisse
- Services metier : `cash-movement.ts`, `reconciliation.ts`, `integrity.ts`, `seuils.ts`, `event-emitter.ts`
- Validations Zod : coherence schemas ↔ modele Prisma
- Store Zustand `cartStore` : calculs panier (remise, taxes, sous-totaux)
- Transactions Prisma (`$transaction`) : atomicite, gestion d'erreurs, rollback
- Coherence des montants : `Decimal` vs `number`, arrondis FCFA (pas de decimales)

**Livrable :** Rapport avec bugs, incoherences logiques, risques financiers

---

### Agent 2 : Audit Securite & Pentest simule

- **Statut :** [x] TERMINE
- **Rapport :** [`rapports/02-securite.md`](rapports/02-securite.md)

**Perimetre :**

**OWASP Top 10 :**
- Injection SQL — verifier les raw queries Prisma, inputs non parametres
- XSS — inputs non sanitises rendus cote client
- CSRF — protection des mutations (POST/PUT/DELETE)
- Mass assignment — champs non prevus acceptes par les schemas Zod

**Controle d'acces :**
- Chaque route verifie `getServerSession` + role
- Tentative d'escalade CAISSIER → ADMIN sur chaque endpoint
- Verification IDOR (acces a des ressources d'autres utilisateurs/sessions)

**Manipulation de transactions :**
- Envoi de montants negatifs dans les paiements
- Quantites a 0 ou negatives dans les ventes
- IDs falsifies (produit inexistant, session d'un autre utilisateur)
- Double soumission de vente (race condition)

**Infrastructure :**
- Headers HTTP (CSP, HSTS, X-Frame-Options)
- Configuration NextAuth (secret, session strategy, cookie flags)
- Exposition de stack traces en production
- Configuration Docker (permissions conteneur, exposition ports, MySQL)

**Secrets & configuration :**
- Scan des fichiers pour tokens/mots de passe hardcodes
- Verification `.gitignore` (`.env`, credentials)
- Variables d'environnement sensibles

**Rate limiting :**
- Absence de protection brute-force sur `/api/auth`
- Absence de throttling sur les endpoints de creation

**Livrable :** Rapport classe par severite (critique / haute / moyenne / basse) avec PoC

---

### Agent 3 : Audit Couverture de Tests

- **Statut :** [x] TERMINE
- **Rapport :** [`rapports/03-couverture-tests.md`](rapports/03-couverture-tests.md)

**Perimetre :**
- Inventaire complet des 51 tests Vitest et 13 specs Cypress
- Matrice : chaque API Route / service → tests existants → trous
- Focus flux financiers : creation vente testee de bout en bout ?
  - Panier → paiement → stock decremente → mouvement cree → ticket genere
- Qualite des tests : assertions significatives vs superficielles, mocks corrects
- Composants critiques sans tests RTL : Cart, PaymentModal, POSGrid, ProductForm
- Mesure couverture actuelle (`npm run test:coverage`)
- Etat des tests Cypress : passent-ils ? Couvrent-ils les parcours critiques ?

**Livrable :** Matrice de couverture, % actuel, liste priorisee des tests a ecrire

---

### Agent 4 : Audit Qualite Code & Pages UI

- **Statut :** [x] TERMINE
- **Rapport :** [`rapports/04-qualite-code.md`](rapports/04-qualite-code.md)

**Perimetre :**
- Toutes les pages dashboard : coherence UI, respect shadcn/ui + Tailwind
- Patterns React : hooks personnalises, TanStack Query vs fetch brut, gestion d'erreurs client
- Conformite `CONVENTIONS.md` :
  - Nommage fichiers, variables, composants
  - Mapping Prisma FR → DTO EN dans les API Routes
  - Structure des fichiers (imports, types, composants)
- Detection code mort, imports inutilises, duplication
- Conformite `PAGES_MVP.md` : toutes les pages prevues implementees ? Actions et roles respectes ?
- Pages hors spec : `caisse/`, `discrepancies/`, `ecarts/` — etat, utilite, integration
- TypeScript strict : usage de `any`, `as unknown`, types manquants

**Livrable :** Rapport avec refactorisations classees par impact (haute / moyenne / basse)

---

## 3. Vague 1 — Consolidation & Plan d'execution

> **Statut :** [x] TERMINE
> **Plan :** [`rapports/05-plan-execution.md`](rapports/05-plan-execution.md)

### Processus

1. Croiser les trouvailles des 4 agents (deduplication)
2. Classifier chaque probleme selon la grille de priorite
3. Produire le plan d'execution unique

### Grille de priorite

| Niveau | Critere | Exemples | Action |
|--------|---------|----------|--------|
| **P0 — Critique** | Perte de donnees, faille secu exploitable, bug financier | Transaction non atomique, escalade de privilege, montant incorrect | Correction immediate (vague 2) |
| **P1 — Haute** | Bug metier visible, test manquant sur flux financier, faille secu moyenne | Stock non restaure a l'annulation, absence rate limiting auth | Correction vague 2 |
| **P2 — Moyenne** | Incoherence code, test manquant non-financier, dette technique | Mapping DTO absent, composant sans test RTL, code duplique | Correction vague 3 |
| **P3 — Basse** | Convention non respectee, amelioration UI, optimisation | Nommage, ordre imports, refacto cosmetique | Vague 3 si temps |

### Format du plan

```
PLAN D'EXECUTION CONSOLIDE
+-- P0 — Corrections critiques (vague 2)
|   +-- [SECU-001] Description → fichiers → test a ecrire
|   +-- [FIN-001] Description → fichiers → test a ecrire
+-- P1 — Corrections haute priorite (vague 2)
|   +-- [META-001] Description → fichiers → test a ecrire
+-- P2 — Refactorisations & tests (vague 3)
|   +-- [REFAC-001] Description → fichiers
|   +-- [TEST-001] Tests manquants → liste
+-- P3 — Ameliorations (vague 3, si temps)
+-- Metriques cibles
    +-- Couverture Vitest >= 80%
    +-- 0 faille critique/haute ouverte
    +-- Tous les flux financiers testes e2e
```

---

## 4. Vague 2 — Corrections critiques

> **Statut :** [ ] En attente (apres vague 1)

### Agents d'execution (3 en parallele)

| Agent | Perimetre | Type de corrections |
|-------|-----------|---------------------|
| **Exec-Finance** | Transactions, montants, paiements, caisse | Atomicite `$transaction`, arrondis Decimal, coherence stock-vente, annulations |
| **Exec-Securite** | Failles OWASP, controle d'acces, infra | Validation d'entrees, escalade roles, headers HTTP, rate limiting, secrets |
| **Exec-Tests-Critiques** | Tests manquants sur flux financiers | Tests Vitest routes transactionnelles, tests Cypress e2e vente + annulation |

### Protocole par correction (TDD)

1. Ecrire le test qui reproduit le probleme
2. Verifier que le test echoue
3. Implementer la correction minimale
4. Verifier que le test passe
5. Lancer `npm run test` pour detecter les regressions
6. Marquer le ticket comme resolu dans `rapports/05-plan-execution.md`

### Point de controle fin de vague 2

- [ ] Tous les P0 corriges avec tests
- [ ] Tous les P1 corriges avec tests
- [ ] Suite de tests complete verte (`npm run test`)
- [ ] 0 regression introduite

---

## 5. Vague 3 — Refactorisations & couverture

> **Statut :** [ ] En attente (apres vague 2)

### Agents d'execution (3 en parallele)

| Agent | Perimetre | Type de corrections |
|-------|-----------|---------------------|
| **Refac-Code** | Qualite code, conventions, dette technique | Mapping Prisma→DTO, code mort, deduplication, conformite CONVENTIONS.md |
| **Refac-Pages** | Pages UI, coherence, pages hors spec | Verification vs PAGES_MVP.md, nettoyage pages orphelines, harmonisation patterns React |
| **Tests-Completion** | Couverture restante >= 80% | Tests RTL (Cart, PaymentModal, POSGrid, ProductForm), Vitest modules manquants, Cypress parcours stock |

### Protocole identique (TDD)

Meme protocole que vague 2 + verification de non-regression apres chaque modification.

### Point de controle fin de vague 3

- [ ] Couverture Vitest >= 80%
- [ ] Conformite CONVENTIONS.md verifiee
- [ ] Toutes les pages validees vs PAGES_MVP.md
- [ ] Pages hors spec documentees ou nettoyees
- [ ] Suite de tests complete verte

---

## 6. Vague 4 — Revue finale

> **Statut :** [ ] En attente (apres vague 3)
> **Rapport :** [`RAPPORT-FINAL.md`](RAPPORT-FINAL.md)

### Agent code-reviewer

- Diff complet depuis le debut de l'audit
- Verification que chaque correction a son test
- Lancement complet :
  - `npm run test` (Vitest)
  - `npm run test:e2e` (Cypress)
  - `npm run lint` (ESLint)
  - `npm run type-check` (tsc --noEmit)
- Rapport final avec metriques atteintes vs cibles
- Recommandations pour le tag v1.0.0

### Criteres de succes

| Metrique | Cible | Resultat |
|----------|-------|----------|
| Couverture Vitest | >= 80% | [ ] |
| Failles critiques ouvertes | 0 | [ ] |
| Failles hautes ouvertes | 0 | [ ] |
| Flux financiers testes e2e | 100% | [ ] |
| Suite Vitest | verte | [ ] |
| Suite Cypress | verte | [ ] |
| ESLint | 0 erreurs | [ ] |
| TypeScript strict | 0 erreurs | [ ] |

---

## 7. Suivi d'avancement

### Progression globale

| Vague | Statut | Date debut | Date fin | Notes |
|-------|--------|------------|----------|-------|
| Vague 0 — Audit | [x] TERMINE | 4 mai 2026 | 4 mai 2026 | 4 agents paralleles — 23+14+6+13 problemes identifies |
| Vague 1 — Plan | [x] TERMINE | 4 mai 2026 | 4 mai 2026 | 44 tickets dedupliques (7 P0, 13 P1, 14 P2, 10 P3) |
| Vague 2 — P0/P1 | [x] TERMINE | 4 mai 2026 | 4 mai 2026 | 20 tickets corriges, 67 nouveaux tests, 722 passes |
| Vague 3 — P2/P3 | [x] TERMINE | 4 mai 2026 | 4 mai 2026 | 23 tickets traites, 75 nouveaux tests, 797 passes |
| Vague 4 — Revue | [x] TERMINE | 4 mai 2026 | 4 mai 2026 | 0 erreur TS, 797 tests verts, rapport final ecrit |

### Log des modifications

| Date | Vague | Action | Fichiers modifies |
|------|-------|--------|-------------------|
| 2026-05-04 | - | Creation du plan d'audit | `docs/audit/AUDIT-PLAN.md` |
| 2026-05-04 | 0 | Audit logique metier termine (23 problemes) | `docs/audit/rapports/01-logique-metier.md` |
| 2026-05-04 | 0 | Audit securite termine (14 vulnerabilites) | `docs/audit/rapports/02-securite.md` |
| 2026-05-04 | 0 | Audit couverture tests termine (6 echecs, 0 RTL) | `docs/audit/rapports/03-couverture-tests.md` |
| 2026-05-04 | 0 | Audit qualite code termine (13 problemes) | `docs/audit/rapports/04-qualite-code.md` |
| 2026-05-04 | 1 | Plan d'execution consolide (44 tickets dedupliques) | `docs/audit/rapports/05-plan-execution.md` |
| 2026-05-04 | 2 | Corrections P0+P1 (20 tickets, 67 tests) | 19 fichiers source + 13 fichiers test |
| 2026-05-04 | 3 | Refactorisations P2+P3 (23 tickets, 75 tests) | 48 fichiers modifies |
| 2026-05-04 | 4 | Revue finale : 797 tests, 0 erreur TS, rapport | `docs/audit/RAPPORT-FINAL.md` |

---

## 8. Fichiers de rapports

| Fichier | Contenu | Statut |
|---------|---------|--------|
| [`rapports/01-logique-metier.md`](rapports/01-logique-metier.md) | Audit logique metier & financier | [x] Termine — 23 problemes (5C, 7H, 7M, 4B) |
| [`rapports/02-securite.md`](rapports/02-securite.md) | Audit securite & pentest | [x] Termine — 14 vulnerabilites (2C, 4H, 5M, 3B) |
| [`rapports/03-couverture-tests.md`](rapports/03-couverture-tests.md) | Audit couverture de tests | [x] Termine — 6 echecs, 0 RTL, score 65/100 |
| [`rapports/04-qualite-code.md`](rapports/04-qualite-code.md) | Audit qualite code & pages | [x] Termine — 13 problemes (0C, 2H, 5M, 6B) |
| [`rapports/05-plan-execution.md`](rapports/05-plan-execution.md) | Plan d'execution consolide | [x] Termine — 44 tickets (7 P0, 13 P1, 14 P2, 10 P3) |
| [`RAPPORT-FINAL.md`](RAPPORT-FINAL.md) | Revue finale & metriques | [ ] Vide |

---

## 9. Instructions de reprise

> **Si la session expire**, un nouvel agent peut reprendre le travail en suivant ces instructions.

### Pour reprendre

1. **Lire ce fichier** (`docs/audit/AUDIT-PLAN.md`) en entier
2. **Verifier le statut** de chaque vague dans la section [Suivi d'avancement](#7-suivi-davancement)
3. **Lire les rapports existants** dans `docs/audit/rapports/`
4. **Reprendre a la vague en cours** :
   - Si vague 0 incomplete → lancer les agents d'audit manquants
   - Si vague 0 complete mais pas vague 1 → consolider les rapports
   - Si vague 1 complete → executer la prochaine vague selon le plan
5. **Mettre a jour ce fichier** apres chaque action (statut, log des modifications)

### Commandes utiles

```bash
# Depuis web/app/
npm run test              # Vitest
npm run test:coverage     # Couverture
npm run test:e2e          # Cypress
npm run lint              # ESLint
npm run type-check        # TypeScript strict
```

### Fichiers cles du projet

- `CLAUDE.md` — Consignes agents
- `CONVENTIONS.md` — Conventions de code
- `ARCHITECTURE_MVP.md` — Architecture & schema Prisma
- `TODO.md` — Suivi des taches projet
- `SPECS/` — Specifications par module
- `web/app/src/` — Code source applicatif

---

*Audit AerisPay — Document cree le 4 mai 2026*
