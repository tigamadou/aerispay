# Audit AerisPay — Plan d'Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec de reference :** `docs/audit/AUDIT-PLAN.md`
> **Rapports :** `docs/audit/rapports/`

**Goal:** Auditer la logique metier, la securite, les tests et la qualite du code AerisPay, puis corriger tous les problemes trouves par ordre de priorite.

**Architecture:** 4 agents d'audit paralleles (Vague 0) produisent des rapports dans `docs/audit/rapports/`. Un agent consolidateur (Vague 1) fusionne les trouvailles en plan d'execution. Des agents d'execution (Vagues 2-3) corrigent par priorite avec TDD. Un agent reviewer (Vague 4) valide le tout.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Prisma, MySQL, Vitest, Cypress, React Testing Library

**Repertoire de travail :** `web/app/` pour toutes les commandes npm/vitest/cypress

---

## Vague 0 — Audit Parallele

Les 4 taches suivantes sont **independantes** et doivent etre lancees en parallele.

---

### Task 1: Audit Logique Metier & Financier

**Files:**
- Read: `src/app/api/ventes/route.ts` (creation de vente — transaction atomique)
- Read: `src/app/api/ventes/[id]/annuler/route.ts` (annulation + restauration stock)
- Read: `src/app/api/comptoir/sessions/route.ts` (ouverture session)
- Read: `src/app/api/comptoir/sessions/[id]/route.ts` (fermeture session)
- Read: `src/app/api/comptoir/sessions/[id]/closure/route.ts` (cloture caisse)
- Read: `src/app/api/comptoir/sessions/[id]/validate/route.ts` (validation session)
- Read: `src/app/api/comptoir/sessions/[id]/correct/route.ts` (correction session)
- Read: `src/app/api/comptoir/sessions/[id]/force-close/route.ts` (fermeture forcee)
- Read: `src/app/api/comptoir/sessions/[id]/verify/route.ts` (verification integrite)
- Read: `src/app/api/comptoir/sessions/[id]/z-report/route.ts` (ticket Z)
- Read: `src/app/api/comptoir/sessions/[id]/movements/route.ts` (mouvements session)
- Read: `src/app/api/comptoir/movements/route.ts` (mouvements comptoir)
- Read: `src/app/api/comptoir/sync/route.ts` (synchronisation)
- Read: `src/app/api/comptoir/discrepancies/route.ts` (ecarts)
- Read: `src/app/api/comptoir/discrepancies/recurring/route.ts` (ecarts recurrents)
- Read: `src/app/api/stock/mouvements/route.ts` (mouvements stock)
- Read: `src/app/api/caisse/route.ts` (CRUD caisse)
- Read: `src/app/api/caisse/[id]/mouvements/route.ts` (mouvements caisse)
- Read: `src/app/api/caisse/[id]/soldes/route.ts` (soldes caisse)
- Read: `src/lib/services/cash-movement.ts`
- Read: `src/lib/services/reconciliation.ts`
- Read: `src/lib/services/integrity.ts`
- Read: `src/lib/services/seuils.ts`
- Read: `src/lib/services/event-emitter.ts`
- Read: `src/lib/validations/vente.ts`
- Read: `src/lib/validations/session.ts`
- Read: `src/lib/validations/mouvement.ts`
- Read: `src/lib/validations/mouvement-caisse.ts`
- Read: `src/store/cartStore.ts`
- Read: `prisma/schema.prisma`
- Modify: `docs/audit/rapports/01-logique-metier.md` (ecrire le rapport)

**Instructions pour l'agent :**

L'agent doit lire TOUS les fichiers listes ci-dessus et analyser :

- [ ] **Step 1: Lire le schema Prisma et les validations Zod**

Lire `prisma/schema.prisma` et tous les fichiers dans `src/lib/validations/`. Verifier :
- Les schemas Zod couvrent-ils tous les champs du modele Prisma ?
- Y a-t-il des champs acceptes par Zod mais absents du schema Prisma (ou inversement) ?
- Les contraintes de validation (min, max, regex) sont-elles suffisantes ?
- Les montants sont-ils valides en Zod comme `number > 0` (pas de negatifs pour les prix) ?
- Les quantites sont-elles validees comme `int >= 1` ?

Noter chaque incoherence dans le rapport.

- [ ] **Step 2: Auditer POST /api/ventes (creation de vente)**

Lire `src/app/api/ventes/route.ts`. Verifier :
- **Atomicite** : la transaction `$transaction` inclut-elle TOUTES les operations (vente + lignes + paiements + decrementation stock + mouvements stock + mouvements caisse) ?
- **Race condition** : le numero de vente est genere via `findFirst` + increment — deux ventes simultanees peuvent-elles obtenir le meme numero ?
- **Calcul montants** : `lineSubtotal = prixUnitaire * quantite * (1 - remise / 100)` — la remise est un pourcentage, mais le code cote cartStore fait pareil ? Coherence ?
- **Decimal vs number** : `sousTotal` est un `Prisma.Decimal`, mais `lineSubtotal` est calcule en `number` JS — y a-t-il une perte de precision ?
- **Verification paiement** : `totalPaiements.lt(total)` — le paiement peut etre superieur au total (monnaie rendue), est-ce correctement gere ?
- **Montant mouvement caisse** : `Math.min(montant, remainingTotal)` — verifie que la monnaie rendue n'est pas comptee comme revenu
- **Gestion d'erreurs** : le `TxError` dans la transaction remonte-t-il correctement ?

- [ ] **Step 3: Auditer POST /api/ventes/[id]/annuler**

Lire `src/app/api/ventes/[id]/annuler/route.ts`. Verifier :
- **Restauration stock** : chaque ligne restaure le stock ? Le `quantiteAvant`/`quantiteApres` est-il correct ?
- **Mouvement caisse REMBOURSEMENT** : le montant est negatif (`-Math.abs`) — est-ce coherent avec le calcul de solde theorique ?
- **Cas `caisseId` vide** : si aucune caisse active → `caisseId = ""` — le mouvement caisse sera cree avec un caisseId invalide !
- **Double annulation** : verifier que le statut `ANNULEE` empeche une seconde annulation
- **Session fermee** : peut-on annuler une vente dont la session est deja fermee/validee ?

- [ ] **Step 4: Auditer les sessions comptoir (ouverture/fermeture/closure/validate/correct/force-close)**

Lire les 7 fichiers de routes session. Pour chaque route, verifier :
- Auth et permissions correctes
- Verification de l'etat de la session avant modification
- Transaction atomique quand necessaire
- Coherence des champs mis a jour (montants, statuts, dates)
- Le hash d'integrite est-il calcule et stocke correctement ?

- [ ] **Step 5: Auditer les services metier**

Lire `cash-movement.ts`, `reconciliation.ts`, `integrity.ts`, `seuils.ts`, `event-emitter.ts`. Verifier :
- **cash-movement** : `computeSoldeCaisseParMode` additionne TOUS les mouvements sans filtrer par session — est-ce correct pour une caisse multi-sessions ?
- **reconciliation** : les seuils sont charges dynamiquement — que se passe-t-il si un seuil n'existe pas en base ?
- **integrity** : le hash SHA-256 est-il deterministe ? Les champs `as Record<string, number>` sont-ils corrects (cast de Json Prisma) ?
- **seuils** : valeurs par defaut si seuil absent ? Gestion d'erreurs ?

- [ ] **Step 6: Auditer le cartStore Zustand**

Lire `src/store/cartStore.ts`. Verifier :
- Le calcul `sousTotal()` dans le store correspond au calcul dans l'API (`prixUnitaire * quantite * (1 - remise / 100)`)
- Le calcul des taxes correspond a celui de l'API (taxes sur `base = sousTotal - remise`)
- Les arrondis : le store utilise `Math.round` pour les taxes, l'API utilise `.round()` de Decimal — coherence ?
- La remise globale : pourcentage OU fixe dans le store, mais l'API recoit un montant fixe `remise` — qui fait la conversion ?

- [ ] **Step 7: Ecrire le rapport**

Remplir `docs/audit/rapports/01-logique-metier.md` avec toutes les trouvailles. Format :
- Pour chaque probleme : ID, severite (critique/haute/moyenne/basse), description, fichier(s), impact
- Section recommandations avec corrections proposees

---

### Task 2: Audit Securite & Pentest Simule

**Files:**
- Read: TOUS les fichiers `src/app/api/**/route.ts` (68 routes)
- Read: `src/lib/permissions.ts`
- Read: `src/lib/auth.ts` ou `src/auth.ts` (config NextAuth)
- Read: `src/lib/validations/*.ts` (8 schemas Zod)
- Read: `src/middleware.ts` (si present)
- Read: `prisma/schema.prisma`
- Read: `.gitignore`
- Read: `.env.local` ou `.env` (verifier s'il est commite)
- Read: `next.config.ts` ou `next.config.js`
- Read: `../../docker-compose.yml` et `../../docker-compose.prod.yml`
- Modify: `docs/audit/rapports/02-securite.md` (ecrire le rapport)

**Instructions pour l'agent :**

- [ ] **Step 1: Scanner le controle d'acces de chaque route API**

Pour CHAQUE fichier `route.ts` dans `src/app/api/`, verifier :
1. La route appelle-t-elle `requireAuth()` ou `requireRole(...)` en tout premier ?
2. Le role requis est-il correct selon `ARCHITECTURE_MVP.md` section 8 (matrice des roles) ?
3. Y a-t-il des routes qui verifient l'auth mais pas le role quand c'est necessaire ?

Construire un tableau :

```
| Route | Methode | Auth | Role requis | Role effectif | Correct ? |
```

- [ ] **Step 2: Tester les escalades de privilege**

Pour chaque endpoint restreint a ADMIN ou MANAGER, verifier dans le code :
- Un CAISSIER peut-il appeler `POST /api/users` ? (Le code verifie-t-il `requireRole("ADMIN")` ?)
- Un CAISSIER peut-il annuler une vente via `POST /api/ventes/[id]/annuler` ?
- Un utilisateur peut-il acceder a la session d'un autre via `GET /api/comptoir/sessions/[id]` ? (IDOR)
- Un CAISSIER peut-il forcer la fermeture d'une session via `POST /api/comptoir/sessions/[id]/force-close` ?

Pour chaque test, noter : endpoint, payload, resultat attendu vs resultat code, severite.

- [ ] **Step 3: Tester la manipulation de transactions**

Analyser dans le code si les validations Zod bloquent :
- Montant negatif dans un paiement : `{ montant: -1000 }` → le schema `vente.ts` valide-t-il `montant > 0` ?
- Quantite 0 ou negative : `{ quantite: 0 }` ou `{ quantite: -5 }` → schema valide `quantite >= 1` ?
- ProduitId inexistant : le code verifie-t-il que le produit existe ET est actif ?
- Double soumission : y a-t-il une protection (numero unique, idempotency key) ?
- Montant remise superieur au sous-total → le total pourrait devenir negatif ?

- [ ] **Step 4: Auditer la configuration auth**

Lire la config NextAuth. Verifier :
- Le provider credentials hash-t-il les mots de passe (bcrypt) ?
- `NEXTAUTH_SECRET` est-il present dans `.env.local` (pas hardcode) ?
- La strategie de session (JWT vs database) est-elle securisee ?
- Les cookies ont-ils les flags `httpOnly`, `secure`, `sameSite` ?

- [ ] **Step 5: Scanner les secrets et la configuration**

- Verifier que `.env`, `.env.local`, `.env.production` sont dans `.gitignore`
- Chercher dans tout le code source des patterns : `password`, `secret`, `token`, `api_key` en dur
- Verifier `next.config` pour les headers de securite (CSP, HSTS, X-Frame-Options)
- Verifier que les stack traces ne sont pas exposees en production (le code utilise `console.error` partout — visible en prod ?)

- [ ] **Step 6: Auditer la configuration Docker**

Lire `docker-compose.yml` et `docker-compose.prod.yml`. Verifier :
- MySQL est-il expose sur un port public en production ?
- Le mot de passe MySQL est-il dans un fichier `.env` non commite ?
- L'app tourne-t-elle en tant que root dans le conteneur ?
- phpMyAdmin est-il desactive en production ?

- [ ] **Step 7: Verifier le rate limiting**

Chercher dans le code toute reference a :
- Rate limiting, throttling, brute-force protection
- Si absent : noter comme faille haute sur les endpoints d'auth et de creation

- [ ] **Step 8: Verifier les dependances vulnerables**

```bash
cd web/app && npm audit
```

Noter les CVE critiques/hautes.

- [ ] **Step 9: Ecrire le rapport securite**

Remplir `docs/audit/rapports/02-securite.md`. Format :
- Chaque vulnerabilite : ID, severite, categorie OWASP, description, PoC (le code qui le prouve), fichier(s)
- Section recommandations avec corrections proposees

---

### Task 3: Audit Couverture de Tests

**Files:**
- Read: TOUS les fichiers `src/__tests__/**/*.test.ts` (51 fichiers)
- Read: TOUS les fichiers `cypress/e2e/**/*.cy.ts` (13 specs)
- Read: `vitest.config.ts` ou `vite.config.ts`
- Read: `cypress.config.ts`
- Read: `package.json` (scripts de test)
- Modify: `docs/audit/rapports/03-couverture-tests.md` (ecrire le rapport)

**Instructions pour l'agent :**

- [ ] **Step 1: Mesurer la couverture actuelle**

```bash
cd web/app && npx vitest run --coverage --reporter=verbose 2>&1 | tail -100
```

Si la commande echoue, noter l'erreur et essayer :
```bash
cd web/app && npx vitest run --reporter=verbose 2>&1 | tail -50
```

Noter : nombre de tests, passes, echoues, couverture % (statements, branches, functions, lines).

- [ ] **Step 2: Inventorier les tests Vitest**

Pour chaque fichier dans `src/__tests__/`, lire le fichier et noter :
- Quelles routes/services/composants sont testes
- Nombre d'assertions (`expect(...)`)
- Qualite : les assertions verifient-elles le comportement metier (pas juste `toBeDefined()`) ?
- Les mocks sont-ils realistes (pas de `jest.fn()` vides) ?

- [ ] **Step 3: Inventorier les tests Cypress**

Pour chaque spec dans `cypress/e2e/`, lire et noter :
- Quels parcours utilisateur sont couverts
- Les assertions verifient-elles le resultat (pas juste la navigation) ?
- Les tests sont-ils independants (pas de dependance d'ordre) ?

- [ ] **Step 4: Construire la matrice de couverture**

Croiser les routes API, services et composants avec les tests existants :

```
| Fichier source | Test Vitest | Test Cypress | Couvert ? |
```

Identifier les trous : fichiers source sans aucun test.

- [ ] **Step 5: Evaluer la couverture du flux financier**

Le flux complet de vente est-il teste de bout en bout ?
1. Ajout au panier (cartStore) → test unitaire ?
2. Calcul sous-total + taxes + remise → test unitaire ?
3. POST /api/ventes → test d'integration ?
4. Decrementation stock verifiee ? → assertion dans le test ?
5. Mouvement stock cree ? → assertion ?
6. Mouvement caisse cree ? → assertion ?
7. Generation ticket PDF → test ?
8. Annulation + restauration stock → test ?

- [ ] **Step 6: Identifier les tests prioritaires manquants**

Classer par priorite :
- P1 : tests manquants sur les flux financiers
- P1 : tests manquants sur le controle d'acces
- P2 : tests manquants sur les composants critiques (Cart, PaymentModal, POSInterface)
- P2 : tests manquants sur les services metier
- P3 : tests manquants sur les pages et routes non critiques

- [ ] **Step 7: Ecrire le rapport couverture**

Remplir `docs/audit/rapports/03-couverture-tests.md` avec toutes les trouvailles.

---

### Task 4: Audit Qualite Code & Pages UI

**Files:**
- Read: TOUTES les pages `src/app/(dashboard)/**/page.tsx`
- Read: TOUS les composants `src/components/**/*.tsx`
- Read: TOUS les hooks `src/hooks/*.ts`
- Read: `src/store/cartStore.ts`, `src/store/offlineStore.ts`
- Read: TOUTES les API routes `src/app/api/**/route.ts`
- Read: `CONVENTIONS.md` (racine du depot)
- Read: `SPECS/PAGES_MVP.md`
- Modify: `docs/audit/rapports/04-qualite-code.md` (ecrire le rapport)

**Instructions pour l'agent :**

- [ ] **Step 1: Verifier la conformite PAGES_MVP.md**

Lire `SPECS/PAGES_MVP.md`. Pour chaque page listee, verifier :
- La page existe-t-elle dans `src/app/(dashboard)/` ?
- Les actions listees sont-elles implementees ?
- Les rôles sont-ils respectes (pages reservees ADMIN/MANAGER non accessibles CAISSIER) ?

Lister les pages implementees MAIS absentes de PAGES_MVP.md :
- `src/app/(dashboard)/caisse/` — module caisse (hors spec ?)
- `src/app/(dashboard)/comptoir/discrepancies/` — ecarts (hors spec ?)
- `src/app/(dashboard)/comptoir/ecarts/` — ecarts (doublon ?)
- `src/app/(dashboard)/caisse/mouvements/nouveau/` — creation mouvement caisse

Pour chaque page hors spec, determiner : est-elle utile, integree, testee ?

- [ ] **Step 2: Verifier la conformite CONVENTIONS.md**

Pour un echantillon representatif de fichiers (au moins 15), verifier :
- Nommage : composants PascalCase, pages kebab-case, variables anglais
- Structure : imports externes → internes → types → composant
- Props typees avec interface nommee (pas `any`)
- Mapping Prisma FR → DTO EN dans les routes API (ex: `produit.nom` → `name` dans la reponse)

Note speciale sur le mapping : les conventions exigent un mapping, mais le code actuel retourne-t-il les champs Prisma bruts ? C'est un probleme de coherence majeur s'il est confirme.

- [ ] **Step 3: Analyser les patterns React**

Pour chaque page dashboard, verifier :
- Utilise-t-elle TanStack Query (via hooks dans `src/hooks/`) ou du fetch brut ?
- Gestion des etats de chargement (loading, error, empty) ?
- Toast de notification pour les actions (succes/erreur) ?
- Composants shadcn/ui utilises correctement ?

- [ ] **Step 4: Detecter le code mort et la duplication**

```bash
cd web/app && npx tsc --noEmit 2>&1 | head -50
```

Chercher :
- Variables/imports non utilises
- Composants non references
- Routes API sans page correspondante
- Duplication de logique entre fichiers

- [ ] **Step 5: Verifier TypeScript strict**

Chercher dans tout le code :
- Usage de `any` (grep `": any"` et `as any`)
- Usage de `as unknown`
- Props non typees
- Retours API sans type explicite

```bash
cd web/app && grep -rn ": any" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__
```

- [ ] **Step 6: Ecrire le rapport qualite**

Remplir `docs/audit/rapports/04-qualite-code.md` avec toutes les trouvailles. Classer par impact.

---

## Vague 1 — Consolidation

### Task 5: Consolider les rapports en plan d'execution

**Dependances :** Tasks 1, 2, 3, 4 (toutes completees)

**Files:**
- Read: `docs/audit/rapports/01-logique-metier.md`
- Read: `docs/audit/rapports/02-securite.md`
- Read: `docs/audit/rapports/03-couverture-tests.md`
- Read: `docs/audit/rapports/04-qualite-code.md`
- Modify: `docs/audit/rapports/05-plan-execution.md`
- Modify: `docs/audit/AUDIT-PLAN.md` (mettre a jour le suivi)

- [ ] **Step 1: Lire les 4 rapports d'audit**

Lire chaque rapport et extraire tous les problemes trouves avec leur severite.

- [ ] **Step 2: Deduplication**

Identifier les problemes signales par plusieurs agents. Par exemple :
- Un bug financier (Agent 1) qui est aussi une faille de securite (Agent 2)
- Un test manquant (Agent 3) sur une route avec un probleme de qualite (Agent 4)

Fusionner les doublons en gardant la severite la plus haute.

- [ ] **Step 3: Classifier selon la grille de priorite**

Appliquer la grille de `AUDIT-PLAN.md` :
- **P0 (Critique)** : perte de donnees, faille exploitable, bug financier
- **P1 (Haute)** : bug metier visible, test manquant flux financier, faille moyenne
- **P2 (Moyenne)** : incoherence code, test manquant non-financier, dette technique
- **P3 (Basse)** : convention non respectee, amelioration UI, optimisation

- [ ] **Step 4: Ecrire le plan d'execution**

Remplir `docs/audit/rapports/05-plan-execution.md` avec :
- Chaque probleme : ID, source (rapport), description, fichier(s), test a ecrire, statut
- Grouper par priorite (P0, P1, P2, P3)
- Ajouter les metriques actuelles vs cibles

- [ ] **Step 5: Mettre a jour le suivi**

Dans `docs/audit/AUDIT-PLAN.md`, mettre a jour :
- Statut de la vague 0 → completee
- Statut de la vague 1 → completee
- Log des modifications

---

## Vague 2 — Corrections Critiques (P0 + P1)

Les 3 taches suivantes sont **paralleles** mais utilisent le plan d'execution comme reference.

### Task 6: Corrections financieres (Exec-Finance)

**Dependance :** Task 5

**Files:** Determines par le plan d'execution (rapports/05-plan-execution.md), mais probablement :
- Modify: `src/app/api/ventes/route.ts`
- Modify: `src/app/api/ventes/[id]/annuler/route.ts`
- Modify: `src/app/api/comptoir/sessions/[id]/route.ts`
- Modify: `src/lib/services/cash-movement.ts`
- Modify: `src/lib/services/reconciliation.ts`
- Modify: `src/lib/validations/vente.ts`
- Modify: `src/store/cartStore.ts`
- Test: `src/__tests__/ventes/` (nouveaux tests)
- Test: `src/__tests__/caisse/` (nouveaux tests)

**Instructions pour l'agent :**

- [ ] **Step 1: Lire le plan d'execution**

Lire `docs/audit/rapports/05-plan-execution.md`. Extraire TOUS les tickets P0 et P1 de type financier (ID commencant par FIN-*).

- [ ] **Step 2: Pour chaque ticket P0 financier (TDD)**

Pour chaque ticket, dans l'ordre :
1. Ecrire le test Vitest qui expose le bug dans `src/__tests__/`
2. Lancer `cd web/app && npx vitest run <fichier-test> --reporter=verbose` → verifier qu'il echoue
3. Implementer la correction minimale
4. Relancer le test → verifier qu'il passe
5. Lancer `cd web/app && npx vitest run --reporter=verbose` → verifier 0 regression
6. Cocher le ticket dans `docs/audit/rapports/05-plan-execution.md`

- [ ] **Step 3: Pour chaque ticket P1 financier (TDD)**

Meme protocole que Step 2.

- [ ] **Step 4: Verification finale**

```bash
cd web/app && npx vitest run --reporter=verbose
```

Tous les tests doivent passer. Mettre a jour le suivi dans `AUDIT-PLAN.md`.

---

### Task 7: Corrections securite (Exec-Securite)

**Dependance :** Task 5

**Files:** Determines par le plan d'execution, mais probablement :
- Modify: `src/app/api/**/route.ts` (ajout/correction auth)
- Modify: `src/lib/validations/*.ts` (renforcement validations)
- Modify: `src/lib/permissions.ts` (si necessaire)
- Modify: `next.config.ts` (headers securite)
- Create: `src/middleware.ts` (rate limiting si absent)
- Test: `src/__tests__/auth/` (nouveaux tests)
- Test: `src/__tests__/` (tests de securite)

**Instructions pour l'agent :**

- [ ] **Step 1: Lire le plan d'execution**

Extraire TOUS les tickets P0 et P1 de type securite (ID SECU-*).

- [ ] **Step 2: Pour chaque ticket P0 securite (TDD)**

1. Ecrire le test qui prouve la vulnerabilite (ex: appel API sans auth → doit retourner 401)
2. Verifier que le test echoue (la faille existe)
3. Corriger (ajout auth, validation, etc.)
4. Verifier que le test passe
5. Lancer la suite complete
6. Cocher dans le plan

- [ ] **Step 3: Pour chaque ticket P1 securite (TDD)**

Meme protocole.

- [ ] **Step 4: Ajouter les headers de securite si manquants**

Dans `next.config.ts`, ajouter si absent :
```ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
```

- [ ] **Step 5: Verification finale**

```bash
cd web/app && npx vitest run --reporter=verbose
```

Mettre a jour le suivi.

---

### Task 8: Tests critiques manquants (Exec-Tests-Critiques)

**Dependance :** Task 5

**Files:** Determines par le plan d'execution + rapport couverture, mais probablement :
- Create/Modify: `src/__tests__/ventes/sale-flow.test.ts` (flux complet de vente)
- Create/Modify: `src/__tests__/ventes/cancel-flow.test.ts` (flux annulation)
- Create/Modify: `src/__tests__/comptoir/session-lifecycle.test.ts` (cycle session)
- Create/Modify: `src/__tests__/auth/access-control.test.ts` (controle d'acces exhaustif)
- Create/Modify: `cypress/e2e/ventes/ventes.cy.ts` (parcours e2e vente)
- Create/Modify: `cypress/e2e/comptoir/session-flow.cy.ts` (parcours e2e session)

**Instructions pour l'agent :**

- [ ] **Step 1: Lire le plan d'execution et le rapport couverture**

Extraire TOUS les tickets P0/P1 de type TEST-* et la matrice de couverture du rapport 03.

- [ ] **Step 2: Ecrire les tests Vitest pour le flux financier complet**

Tests a ecrire (adapter selon le rapport) :
1. Creation de vente : verifie que le stock est decremente, le mouvement stock cree, le mouvement caisse cree, le total correct
2. Annulation de vente : verifie que le stock est restaure, le mouvement RETOUR cree, le mouvement REMBOURSEMENT cree
3. Validation de session : verifie le hash d'integrite, la reconciliation, les ecarts
4. Controle d'acces : CAISSIER ne peut pas annuler, CAISSIER ne peut pas gerer users, etc.

- [ ] **Step 3: Ecrire les tests Cypress pour les parcours critiques**

Si les parcours suivants ne sont pas couverts par les tests Cypress existants :
1. Connexion → ouverture session → ajout produit → paiement → ticket → fermeture session
2. Connexion ADMIN → annulation vente → verification stock restaure
3. Connexion CAISSIER → tentative acces /users → redirection/403

- [ ] **Step 4: Lancer tous les tests**

```bash
cd web/app && npx vitest run --reporter=verbose
cd web/app && npx cypress run --reporter spec
```

Verifier que tout passe. Mettre a jour le suivi.

---

## Vague 3 — Refactorisations & Couverture (P2 + P3)

Les 3 taches suivantes sont **paralleles**.

### Task 9: Refactorisation code (Refac-Code)

**Dependance :** Tasks 6, 7, 8

**Files:** Determines par le plan d'execution (tickets P2/P3 de type REFAC-*).

**Instructions pour l'agent :**

- [ ] **Step 1: Lire le plan d'execution**

Extraire TOUS les tickets P2/P3 de type REFAC-*.

- [ ] **Step 2: Appliquer le mapping Prisma FR → DTO EN si necessaire**

Si le rapport 04 a identifie des routes retournant les champs Prisma bruts, creer les fonctions de mapping dans `src/lib/dto/` et les appliquer dans chaque route. TDD : ecrire un test qui verifie le format de la reponse API avant de modifier la route.

Note : cette refactorisation est MAJEURE et peut casser les composants frontend qui consomment ces API. Verifier l'impact avant d'executer.

- [ ] **Step 3: Nettoyer le code mort**

Supprimer les imports inutilises, composants non references, variables non utilisees identifies dans le rapport 04.

- [ ] **Step 4: Deduplication**

Factoriser le code duplique identifie dans le rapport 04.

- [ ] **Step 5: Verification**

```bash
cd web/app && npx vitest run --reporter=verbose && npx tsc --noEmit
```

---

### Task 10: Refactorisation pages UI (Refac-Pages)

**Dependance :** Tasks 6, 7, 8

**Files:** Determines par le plan d'execution (tickets P2/P3 de type PAGE-*).

**Instructions pour l'agent :**

- [ ] **Step 1: Traiter les pages hors spec**

Pour chaque page hors PAGES_MVP.md identifiee dans le rapport 04 :
- Si utile et integree : documenter dans PAGES_MVP.md (avec approbation utilisateur)
- Si doublon : supprimer le doublon
- Si orpheline : supprimer

- [ ] **Step 2: Harmoniser les patterns React**

Si le rapport 04 a identifie des pages avec fetch brut au lieu de TanStack Query, refactorer vers des hooks dans `src/hooks/`.

- [ ] **Step 3: Corriger les problemes TypeScript**

Eliminer les `any`, ajouter les types manquants, typer les props correctement.

- [ ] **Step 4: Verification**

```bash
cd web/app && npx vitest run --reporter=verbose && npx tsc --noEmit
```

---

### Task 11: Completion couverture de tests (Tests-Completion)

**Dependance :** Tasks 6, 7, 8

**Files:** Determines par le rapport 03 (tests manquants P2/P3).

**Instructions pour l'agent :**

- [ ] **Step 1: Ecrire les tests RTL pour les composants critiques**

Composants a tester (si non couverts) :
- `Cart.tsx` — ajout/suppression produit, calcul total, remise
- `PaymentModal.tsx` — selection mode paiement, calcul monnaie, soumission
- `POSInterface.tsx` — grille produits, recherche, scan code-barres
- `ProductForm.tsx` — validation formulaire, soumission

- [ ] **Step 2: Ecrire les tests Vitest pour les modules manquants**

Selon le rapport 03, completer la couverture pour atteindre >= 80%.

- [ ] **Step 3: Mesurer la couverture finale**

```bash
cd web/app && npx vitest run --coverage --reporter=verbose 2>&1 | tail -100
```

Couverture >= 80% ? Si non, identifier et ecrire les tests manquants.

- [ ] **Step 4: Verification**

```bash
cd web/app && npx vitest run --reporter=verbose
```

---

## Vague 4 — Revue Finale

### Task 12: Revue de code finale

**Dependance :** Tasks 9, 10, 11

**Files:**
- Read: TOUS les fichiers modifies depuis le debut de l'audit (diff git)
- Read: `docs/audit/rapports/05-plan-execution.md` (tous les tickets coches ?)
- Modify: `docs/audit/RAPPORT-FINAL.md`
- Modify: `docs/audit/AUDIT-PLAN.md` (suivi final)

**Instructions pour l'agent :**

- [ ] **Step 1: Verifier le diff complet**

```bash
cd web/app && git diff development --stat
```

Passer en revue chaque fichier modifie : la modification est-elle justifiee par un ticket du plan ?

- [ ] **Step 2: Verifier que chaque correction a son test**

Pour chaque ticket P0/P1 dans le plan d'execution, verifier qu'un test Vitest ou Cypress existe et passe.

- [ ] **Step 3: Lancer toutes les suites de verification**

```bash
cd web/app && npx vitest run --coverage --reporter=verbose
cd web/app && npx cypress run --reporter spec
cd web/app && npx eslint src/ --max-warnings=0
cd web/app && npx tsc --noEmit
```

Tous doivent passer sans erreur.

- [ ] **Step 4: Mesurer les metriques finales**

Remplir le tableau dans `RAPPORT-FINAL.md` :

| Metrique | Avant audit | Apres audit | Cible | Atteinte |
|----------|-------------|-------------|-------|----------|
| Couverture Vitest | X% | Y% | >= 80% | oui/non |
| Failles critiques | X | 0 | 0 | oui/non |
| ...etc

- [ ] **Step 5: Ecrire le rapport final**

Remplir `docs/audit/RAPPORT-FINAL.md` :
- Resume executif
- Modifications effectuees (vagues 2 et 3)
- Verifications completees
- Recommandation : pret ou non pour le tag v1.0.0
- Ameliorations post-v1.0.0

- [ ] **Step 6: Mettre a jour le suivi**

Dans `docs/audit/AUDIT-PLAN.md`, marquer toutes les vagues comme completees avec les dates.

---

## Resume des dependances

```
Vague 0 (parallele)     Vague 1       Vague 2 (parallele)     Vague 3 (parallele)     Vague 4
Task 1 ──┐                             Task 6 ──┐               Task 9  ──┐
Task 2 ──┼── Task 5 ──┼── Task 7 ──┼── Task 10 ──┼── Task 12
Task 3 ──┤                             Task 8 ──┘               Task 11 ──┘
Task 4 ──┘
```

---

*Plan cree le 4 mai 2026 — AerisPay Audit Complet*
