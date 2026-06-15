# Plan d'Execution Consolide

> **Date de consolidation :** 4 mai 2026
> **Auteur :** Agent consolidateur (Vague 1)
> **Statut :** PRET POUR EXECUTION

---

## Resume

- **Total problemes (dedupliques) :** 44
- **P0 (Critique) :** 7
- **P1 (Haute) :** 13
- **P2 (Moyenne) :** 14
- **P3 (Basse) :** 10

### Deduplication effectuee

Les doublons suivants ont ete fusionnes (severite la plus haute conservee) :

| ID consolide | Sources fusionnees | Raison |
|---|---|---|
| P0-001 | RACE-001 + SECU-012 | Meme probleme de generation de numero de vente non-atomique |
| P1-001 | ZOD-001 + SECU-011 | Meme probleme de remise sans borne superieure |
| P0-005 | ANNUL-002 + CORRECT-001 | Meme probleme de caisseId vide dans mouvements |
| P1-007 | CAISSE-001 + SECU-009 | Meme probleme de permission semantiquement incorrecte sur POST caisse |

---

## P0 -- Corrections critiques (Vague 2)

> **Critere :** Perte de donnees, faille securite exploitable, bug financier

### P0-001 : Race condition generation numero de vente

- **Source(s) :** RACE-001 + SECU-012
- **Description :** La generation du numero de vente via `findFirst` + increment dans `$transaction` n'est pas atomique. Deux ventes concurrentes peuvent generer le meme numero. La contrainte `@unique` provoque une erreur P2002 non geree, renvoyant un 500 generique au caissier. Le stock peut etre decremente deux fois avant la detection du conflit.
- **Fichier(s) :** `web/app/src/app/api/ventes/route.ts` (L172-180)
- **Test a ecrire :** Test Vitest simulant deux appels POST /api/ventes concurrents ; verifier qu'aucun ne retourne 500, que les numeros sont distincts, et que le stock n'est decremente qu'une seule fois par vente reussie.
- **Statut :** [ ]

### P0-002 : Remboursement depasse le total de la vente (surpaiement)

- **Source(s) :** ANNUL-001
- **Description :** Lors de l'annulation d'une vente, le remboursement utilise `paiement.montant` (montant paye par le client) au lieu de la part couvrant la vente. Si le client a surpaye (ex: 5100 FCFA pour 5000 FCFA), le remboursement sera de -5100 au lieu de -5000, faussant le solde de caisse.
- **Fichier(s) :** `web/app/src/app/api/ventes/[id]/annuler/route.ts` (L71-83)
- **Test a ecrire :** Test Vitest d'annulation avec un paiement incluant un surpaiement ; verifier que le montant total rembourse egale le total de la vente (pas le total paye).
- **Statut :** [ ]

### P0-003 : Annulation possible sur session validee/fermee

- **Source(s) :** ANNUL-003
- **Description :** Aucune verification de l'etat de la session associee lors de l'annulation d'une vente. Une vente d'une session VALIDEE ou FERMEE peut etre annulee, invalidant les soldes et le hash d'integrite de cette session. Les rapports Z deviennent faux.
- **Fichier(s) :** `web/app/src/app/api/ventes/[id]/annuler/route.ts` (L16-29)
- **Test a ecrire :** Test Vitest tentant d'annuler une vente dont la session est VALIDEE ; verifier un rejet 422 avec message explicite.
- **Statut :** [ ]

### P0-004 : Ecarts de cloture biaises (fond d'ouverture manquant)

- **Source(s) :** CLOTURE-001
- **Description :** Les soldes theoriques dans `/closure` n'incluent pas le fond d'ouverture (`montantOuvertureCash`/`MobileMoney`), contrairement au PUT legacy. Tous les ecarts calcules par la cloture multi-etapes sont systematiquement biaises du montant du fond.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sessions/[id]/closure/route.ts` (L55-79)
- **Test a ecrire :** Test Vitest de cloture avec fond d'ouverture de 50000 FCFA ; verifier que le solde theorique inclut le fond et que l'ecart est 0 quand la declaration correspond.
- **Statut :** [ ]

### P0-005 : caisseId vide dans mouvements (annulation + correction)

- **Source(s) :** ANNUL-002 + CORRECT-001
- **Description :** Le `caisseId` est obtenu via `findFirst({ where: { active: true } })` en dehors de la transaction. Si aucune caisse active n'existe, `caisseId` vaut `""` (chaine vide). Les mouvements sont crees avec un caisseId invalide, orphelins dans la base.
- **Fichier(s) :** `web/app/src/app/api/ventes/[id]/annuler/route.ts` (L33-34), `web/app/src/app/api/comptoir/sessions/[id]/correct/route.ts` (L73-74)
- **Test a ecrire :** Test Vitest d'annulation/correction quand aucune caisse active n'existe ; verifier un rejet 422 "Aucune caisse active".
- **Statut :** [ ]

### P0-006 : Fichier .env commit dans Git avec secrets

- **Source(s) :** SECU-001
- **Description :** Le fichier `.env` a la racine du depot est commit dans Git et contient des mots de passe MySQL (`rootsecret`, `aerispay`), un `NEXTAUTH_SECRET` statique, et un `DATABASE_URL` complet. Il n'existe pas de `.gitignore` a la racine du depot.
- **Fichier(s) :** `/.env`, `.gitignore` (a creer a la racine)
- **Test a ecrire :** Pas de test code, mais verifier par script que `.env` n'est plus dans l'index Git (`git ls-files .env` retourne vide).
- **Statut :** [ ]

### P0-007 : Aucun rate-limiting sur l'authentification (brute-force)

- **Source(s) :** SECU-002
- **Description :** Aucun mecanisme de rate-limiting ni protection anti brute-force sur l'endpoint NextAuth. Le middleware (`src/middleware.ts` L10-12) laisse passer toutes les requetes API sans controle. Un attaquant peut tester des milliers de mots de passe par minute.
- **Fichier(s) :** `web/app/src/middleware.ts` (L10-12), `web/app/src/auth.ts`
- **Test a ecrire :** Test Vitest envoyant 10+ tentatives de login en rafale ; verifier qu'a partir de la N-ieme tentative le serveur retourne 429 Too Many Requests.
- **Statut :** [ ]

---

## P1 -- Corrections haute priorite (Vague 2)

> **Critere :** Bug metier visible, test manquant sur flux financier, faille securite moyenne

### P1-001 : Remise vente sans borne superieure (total negatif)

- **Source(s) :** ZOD-001 + SECU-011
- **Description :** `createVenteSchema.remise` est `z.number().min(0)` sans max. Une remise de 999999 FCFA sur un sous-total de 5000 FCFA est acceptee, produisant un total negatif. N'importe quel paiement > 0 suffit alors a valider la vente.
- **Fichier(s) :** `web/app/src/lib/validations/vente.ts` (L27-28), `web/app/src/app/api/ventes/route.ts` (L143)
- **Test a ecrire :** Test Vitest POST /api/ventes avec `remise: 999999` sur un sous-total de 5000 ; verifier un rejet 422. Test supplementaire verifiant que `total > 0` avant creation.
- **Statut :** [ ]

### P1-002 : Hash integrite hors transaction (session corrective)

- **Source(s) :** CORRECT-002
- **Description :** Le hash d'integrite de la session corrective est calcule et stocke apres la transaction. Si le `prisma.comptoirSession.update` du hash echoue, la session corrective existe sans hash et la session originale est deja marquee CORRIGEE.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sessions/[id]/correct/route.ts` (L112-117)
- **Test a ecrire :** Test Vitest simulant un echec du update hash ; verifier que la transaction entiere est annulee (session originale reste dans son etat precedent).
- **Statut :** [ ]

### P1-003 : Race condition verification solde + mouvement caisse

- **Source(s) :** MVT-002
- **Description :** La verification du solde suffisant pour retrait/depense et la creation du mouvement ne sont pas dans une transaction. Un retrait concurrent peut passer alors que le solde est deja insuffisant, rendant le solde negatif.
- **Fichier(s) :** `web/app/src/app/api/comptoir/movements/route.ts` (L161-183), `web/app/src/app/api/caisse/[id]/mouvements/route.ts` (L140-160)
- **Test a ecrire :** Test Vitest simulant deux retraits concurrents sur un solde insuffisant pour les deux ; verifier qu'un seul reussit.
- **Statut :** [ ]

### P1-004 : Arrondi FCFA manquant dans cartStore

- **Source(s) :** CART-002
- **Description :** Le total final du cartStore n'est pas arrondi a l'entier. En FCFA, les decimales ne doivent pas exister. Les calculs intermediaires (`sousTotal`, `montantRemise`) ne sont jamais arrondis.
- **Fichier(s) :** `web/app/src/store/cartStore.ts` (L147-149)
- **Test a ecrire :** Test Vitest du cartStore : ajouter un produit a 1001 FCFA avec remise 33% ; verifier que le total est un entier (Math.round).
- **Statut :** [ ]

### P1-005 : Incoherence remise cartStore vs API

- **Source(s) :** CART-003
- **Description :** Le cartStore envoie la remise globale qui peut etre en pourcentage, tandis que l'API interprete `remise` comme une valeur fixe en FCFA. Si la conversion est oubliee cote frontend, une remise de 10% sera interpretee comme 10 FCFA.
- **Fichier(s) :** `web/app/src/store/cartStore.ts`, `web/app/src/lib/validations/vente.ts`
- **Test a ecrire :** Test Vitest du cartStore verifiant que `getRemiseForAPI()` retourne toujours une valeur fixe FCFA, quel que soit le typeRemise.
- **Statut :** [ ]

### P1-006 : Absence de headers de securite HTTP

- **Source(s) :** SECU-003
- **Description :** `next.config.ts` ne definit aucun header de securite (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). L'application est vulnerable au clickjacking et MIME sniffing.
- **Fichier(s) :** `web/app/next.config.ts`
- **Test a ecrire :** Test Vitest/Cypress verifiant que les reponses HTTP contiennent les headers X-Frame-Options: DENY, X-Content-Type-Options: nosniff.
- **Statut :** [ ]

### P1-007 : Permission semantiquement incorrecte sur POST caisse mouvements

- **Source(s) :** CAISSE-001 + SECU-009
- **Description :** POST `/api/caisse/[id]/mouvements` utilise `hasPermission("rapports:consulter")` pour proteger la creation de mouvements. La permission est destinee a la lecture, pas a l'ecriture.
- **Fichier(s) :** `web/app/src/app/api/caisse/[id]/mouvements/route.ts` (L88-90)
- **Test a ecrire :** Test Vitest verifiant que POST /api/caisse/[id]/mouvements utilise la permission `comptoir:mouvement_manuel` et que GET utilise `rapports:consulter`.
- **Statut :** [ ]

### P1-008 : Ouverture session restreinte a CAISSIER seul

- **Source(s) :** SECU-004
- **Description :** `requireRole("CAISSIER")` exclut les ADMIN et MANAGER de l'ouverture de session comptoir. Ils ne peuvent pas operer la caisse.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sessions/route.ts` (L25)
- **Test a ecrire :** Test Vitest verifiant qu'un ADMIN et un MANAGER peuvent ouvrir une session comptoir (POST 201).
- **Statut :** [ ]

### P1-009 : Synchronisation offline sans idempotence (doublons)

- **Source(s) :** SYNC-001 + SYNC-002
- **Description :** La synchronisation offline utilise `fetch()` interne sans mecanisme d'idempotence. Les operations rejouees creent des doublons de ventes et mouvements. L'ID offline n'est jamais verifie en base.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sync/route.ts` (L44-95)
- **Test a ecrire :** Test Vitest envoyant deux fois le meme batch de sync avec le meme ID offline ; verifier que la deuxieme execution ne cree pas de doublons.
- **Statut :** [ ]

### P1-010 : Mot de passe seed admin en dur (fallback)

- **Source(s) :** SECU-014
- **Description :** Le seed admin utilise `"Admin@1234"` comme fallback quand `SEED_ADMIN_PASSWORD` n'est pas defini. En production, le compte admin aurait un mot de passe trivial et public.
- **Fichier(s) :** `web/app/src/lib/seed/users.ts` (L11)
- **Test a ecrire :** Test Vitest du seed : verifier que sans `SEED_ADMIN_PASSWORD` en env, le seed leve une erreur au lieu d'utiliser le fallback (en mode NODE_ENV=production).
- **Statut :** [ ]

### P1-011 : Corriger les 6 tests en echec

- **Source(s) :** Rapport 03 (tests)
- **Description :** 4 tests `dashboard/kpis-api.test.ts` (cashDiscrepancy, status 500 au lieu de 200) et 2 tests `comptoir/sessions-id-api.test.ts` (soldeTheoriqueCash, status 500 au lieu de 200) sont en echec. Probablement des mocks manquants apres modification de l'API.
- **Fichier(s) :** `web/app/src/__tests__/dashboard/kpis-api.test.ts`, `web/app/src/__tests__/comptoir/sessions-id-api.test.ts`
- **Test a ecrire :** Mettre a jour les mocks manquants ; verifier que les 656 tests passent tous au vert.
- **Statut :** [ ]

### P1-012 : Tests cartStore (store Zustand critique sans test)

- **Source(s) :** Rapport 03 (tests)
- **Description :** Le store Zustand `cartStore` (panier POS) n'a aucun test. Il gere le coeur du flux financier : ajout, suppression, quantites, calcul sous-total, remises, taxes.
- **Fichier(s) :** `web/app/src/store/cartStore.ts` (tests a creer dans `web/app/src/__tests__/store/cartStore.test.ts`)
- **Test a ecrire :** Tests Vitest couvrant : `addItem`, `removeItem`, `updateQuantity`, `clearCart`, calcul `total()`, `sousTotal()`, `itemCount`, remise globale (fixe et pourcentage), taxes.
- **Statut :** [ ]

### P1-013 : Tests integration flux financier (assertions manquantes)

- **Source(s) :** Rapport 03 (tests)
- **Description :** Les tests de transaction de vente verifient que `$transaction` est appele mais pas ce qui se passe a l'interieur. Aucune assertion sur : (a) stock decremente, (b) mouvementStock.create avec type VENTE, (c) mouvement caisse cree avec bon montant/mode. Les annulations manquent aussi d'assertions de restauration stock.
- **Fichier(s) :** `web/app/src/__tests__/ventes/api.test.ts`, `web/app/src/__tests__/ventes/sale-creation.test.ts`
- **Test a ecrire :** Enrichir les tests existants : verifier `produit.update({ stockActuel: initial - quantite })`, `mouvementStock.create({ type: "VENTE" })`, et `createMovementInTx` appele avec le montant correct. Pour annulation : verifier `quantiteApres = quantiteAvant + quantite`.
- **Statut :** [ ]

---

## P2 -- Refactorisations & tests (Vague 3)

> **Critere :** Incoherence code, test manquant non-financier, dette technique

### P2-001 : Mapping Prisma FR vers DTO EN (CONVENTIONS.md 5.1)

- **Source(s) :** QUAL-001
- **Description :** Aucune route API ne respecte la convention 5.1 de mapping Prisma FR vers DTO EN. Toutes les reponses exposent directement les champs francais du schema Prisma (`nom`, `prixVente`, `stockActuel`, etc.). Gros chantier transversal.
- **Fichier(s) :** Toutes les routes dans `web/app/src/app/api/`, creer `web/app/src/lib/dto/` avec fonctions de serialisation par entite
- **Test a ecrire :** Tests Vitest par route verifiant que les reponses contiennent les champs EN (pas les champs FR Prisma).
- **Statut :** [ ]

### P2-002 : Migration vers TanStack Query (conventions 4)

- **Source(s) :** QUAL-002
- **Description :** TanStack Query n'est jamais utilise. Le repertoire `hooks/` n'existe pas. Tous les composants client utilisent `fetch()` brut avec `useState`/`useEffect`, sans cache, sans invalidation, sans retry. Gros chantier transversal.
- **Fichier(s) :** Tous les composants `"use client"` (DashboardCharts, SessionManager, POSInterface, ProductForm, CategoryManager, etc.), creer `web/app/src/hooks/`
- **Test a ecrire :** Tests RTL verifiant que les hooks TanStack Query retournent les donnees attendues et gerent les etats loading/error.
- **Statut :** [ ]

### P2-003 : Toast notifications (remplacer alert())

- **Source(s) :** QUAL-003
- **Description :** Aucune toast notification implementee. Les composants utilisent `alert()` natif. Ni `sonner` ni `react-hot-toast` ne sont utilises.
- **Fichier(s) :** Composants client (ProductForm, CategoryManager, SessionManager, POSInterface, UsersTable, etc.), layout racine
- **Test a ecrire :** Tests RTL verifiant que les actions (creation, erreur) declenchent un toast et non un alert().
- **Statut :** [ ]

### P2-004 : IDOR sur routes GET unitaires (ventes, sessions, tickets)

- **Source(s) :** SECU-006 + SECU-007
- **Description :** GET `/api/ventes/[id]`, GET `/api/tickets/[id]/pdf`, GET `/api/comptoir/sessions/[id]`, GET `/api/comptoir/sessions/[id]/movements` et GET `/api/comptoir/sessions` (listing) ne verifient pas l'ownership pour les CAISSIER. Un CAISSIER peut voir les donnees de n'importe quel autre utilisateur.
- **Fichier(s) :** `web/app/src/app/api/ventes/[id]/route.ts`, `web/app/src/app/api/tickets/[id]/pdf/route.ts`, `web/app/src/app/api/comptoir/sessions/[id]/route.ts`, `web/app/src/app/api/comptoir/sessions/route.ts`
- **Test a ecrire :** Tests Vitest par route : un CAISSIER accedant a une vente/session d'un autre CAISSIER recoit 403 ; ADMIN/MANAGER conservent l'acces total.
- **Statut :** [ ]

### P2-005 : Race condition ouverture session

- **Source(s) :** RACE-002
- **Description :** Verification de session existante + verification solde + creation de session ne sont pas atomiques. Deux caissiers concurrents peuvent ouvrir deux sessions simultanement.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sessions/route.ts` (L39-81)
- **Test a ecrire :** Test Vitest simulant deux ouvertures de session concurrentes ; verifier qu'une seule reussit (l'autre recoit 409).
- **Statut :** [ ]

### P2-006 : Validation remise globale cartStore

- **Source(s) :** CART-001
- **Description :** Le champ `remiseGlobale` n'a pas de validation dans le store. `setRemise(150, "pourcentage")` donne une remise de 150%, total negatif.
- **Fichier(s) :** `web/app/src/store/cartStore.ts` (L108-109)
- **Test a ecrire :** Test Vitest du cartStore : `setRemise(150, "pourcentage")` doit etre plafonner a 100% ou rejete. Le total ne doit jamais etre negatif.
- **Statut :** [ ]

### P2-007 : Validation caissier croise (CAISSIER valide CAISSIER)

- **Source(s) :** VALID-001 + SECU-010
- **Description :** Un CAISSIER quelconque peut valider la session d'un autre caissier. Pas de niveau hierarchique requis. Risque de collusion.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sessions/[id]/validate/route.ts` (L22-23)
- **Test a ecrire :** Test Vitest verifiant qu'un CAISSIER ne peut PAS valider la session d'un autre CAISSIER (si decision = restreindre aux MANAGER/ADMIN). OU documenter le comportement si voulu.
- **Statut :** [ ]

### P2-008 : Validation payload sync offline

- **Source(s) :** SECU-008
- **Description :** POST `/api/comptoir/sync` utilise `z.record(z.unknown())` pour le payload des operations. Pas de validation du contenu, deleguee aux routes en aval.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sync/route.ts` (L8-9)
- **Test a ecrire :** Test Vitest envoyant un payload malformed au sync ; verifier un rejet propre.
- **Statut :** [ ]

### P2-009 : Tests RTL composants critiques

- **Source(s) :** Rapport 03 (tests)
- **Description :** Zero test RTL dans le projet. Les composants critiques (POSInterface, SessionManager, ProductForm, TicketActions, CancelButton) n'ont aucun test composant.
- **Fichier(s) :** Creer dans `web/app/src/__tests__/components/`
- **Test a ecrire :** RTL pour POSInterface (grille produits, ajout panier, bouton paiement), SessionManager (ouverture session, affichage active, formulaire cloture), ProductForm (validation champs, soumission), TicketActions (clic PDF, clic imprimer), CancelButton (confirmation annulation).
- **Statut :** [ ]

### P2-010 : Configurer coverage Vitest

- **Source(s) :** Rapport 03 (tests)
- **Description :** `--coverage` echoue car aucun provider n'est configure. Impossible de mesurer la couverture.
- **Fichier(s) :** `web/app/vitest.config.ts`, `web/app/package.json` (installer `@vitest/coverage-v8`)
- **Test a ecrire :** Verifier que `npm run test:coverage` retourne des metriques ; configurer seuils minimaux (statements >= 80%).
- **Statut :** [ ]

### P2-011 : Page stock lecture seule pour CAISSIER

- **Source(s) :** QUAL-011
- **Description :** La page `/stock` redirige les CAISSIER vers `/` au lieu de leur offrir un acces lecture seule comme indique dans PAGES_MVP.md.
- **Fichier(s) :** `web/app/src/app/(dashboard)/stock/page.tsx` (L37-39)
- **Test a ecrire :** Test Cypress : un CAISSIER accede a /stock et voit les produits sans boutons d'action (pas de "Nouveau", pas de "Modifier").
- **Statut :** [ ]

### P2-012 : Deduplication code (formatMontant, modeLabel, statutLabel, KpiCard)

- **Source(s) :** QUAL-006 + QUAL-007 + QUAL-008
- **Description :** `formatMontant()` redefini localement dans 3 pages. Dictionnaires `modeLabel`/`statutLabel` dupliques dans 4+ fichiers. Composant `KpiCard` defini localement dans 2 pages.
- **Fichier(s) :** `web/app/src/app/(dashboard)/caisse/page.tsx`, `web/app/src/app/(dashboard)/comptoir/discrepancies/page.tsx`, `web/app/src/app/(dashboard)/comptoir/ventes/page.tsx`, `web/app/src/app/(dashboard)/comptoir/ecarts/page.tsx`, `web/app/src/app/(dashboard)/comptoir/sessions/page.tsx`
- **Test a ecrire :** Pas de test specifique, mais verifier par grep que `formatMontant` n'est plus defini localement apres refactorisation.
- **Statut :** [ ]

### P2-013 : Tests routes non couvertes (verify, upload)

- **Source(s) :** Rapport 03 (tests)
- **Description :** Les routes `/api/comptoir/sessions/[id]/verify` et `/api/upload` n'ont aucun test existant.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sessions/[id]/verify/route.ts`, `web/app/src/app/api/upload/route.ts`
- **Test a ecrire :** Tests Vitest pour verify (auth, RBAC ADMIN/MANAGER, hash correct/incorrect) et upload (auth, RBAC, upload/delete).
- **Statut :** [ ]

### P2-014 : Documentation pages hors spec

- **Source(s) :** QUAL-013
- **Description :** 9 pages/routes implementees ne sont pas documentees dans PAGES_MVP.md (caisse, parametres, taxes, ecarts, discrepancies, sessions/[id], ventes/[id], activity-logs/[id], users/[id]).
- **Fichier(s) :** `SPECS/PAGES_MVP.md`
- **Test a ecrire :** Aucun test code. Mettre a jour la documentation.
- **Statut :** [ ]

---

## P3 -- Ameliorations (Vague 3, si temps)

> **Critere :** Convention non respectee, amelioration UI, optimisation

### P3-001 : Performance computeSoldeCaisseParMode (charge tous mouvements en memoire)

- **Source(s) :** CASH-001
- **Description :** `computeSoldeCaisseParMode` charge TOUS les mouvements d'une caisse en memoire. Remplacer par un `groupBy` Prisma ou requete SQL agregee.
- **Fichier(s) :** `web/app/src/lib/services/cash-movement.ts` (L80-83)
- **Statut :** [ ]

### P3-002 : Seuils reconciliation melanges

- **Source(s) :** RECONC-001
- **Description :** Le meme seuil `THRESHOLD_DISCREPANCY_MINOR` (500 FCFA) est utilise pour la tolerance caissier/valideur ET la categorisation des ecarts finaux. Creer un seuil independant `THRESHOLD_CV_TOLERANCE`.
- **Fichier(s) :** `web/app/src/lib/services/reconciliation.ts` (L31-32, L57, L71), `web/app/src/lib/services/seuils.ts`
- **Statut :** [ ]

### P3-003 : Montant correctif de 0 accepte (Zod)

- **Source(s) :** ZOD-002
- **Description :** `correctiveSessionSchema.mouvements[].montant` est `z.number()` sans `.positive()` ni `.nonzero()`. Un mouvement de montant 0 est accepte inutilement.
- **Fichier(s) :** `web/app/src/lib/validations/mouvement-caisse.ts` (L51)
- **Statut :** [ ]

### P3-004 : Code mort -- ProductsTable.tsx

- **Source(s) :** QUAL-004
- **Description :** Composant `ProductsTable.tsx` jamais importe. Remplace par `ProductsGrid.tsx`.
- **Fichier(s) :** `web/app/src/components/stock/ProductsTable.tsx`
- **Statut :** [ ]

### P3-005 : Code mort -- offlineStore.ts (applicatif)

- **Source(s) :** QUAL-005
- **Description :** `offlineStore.ts` n'est utilise que dans un test. Soit l'integrer dans le composant POS, soit le documenter comme feature future.
- **Fichier(s) :** `web/app/src/store/offlineStore.ts`
- **Statut :** [ ]

### P3-006 : Seuil MEDIUM non utilise

- **Source(s) :** SEUIL-001
- **Description :** `THRESHOLD_DISCREPANCY_MEDIUM` (5000) dans les defauts de seuils.ts n'est jamais reference. Artefact de code.
- **Fichier(s) :** `web/app/src/lib/services/seuils.ts` (L6)
- **Statut :** [ ]

### P3-007 : Erreurs stock comme objet literal (pas Error class)

- **Source(s) :** STOCK-001
- **Description :** Les erreurs throw dans la transaction de mouvement stock utilisent un objet literal `{ status, message }` au lieu d'une Error class. Pas de stack trace en debug.
- **Fichier(s) :** `web/app/src/app/api/stock/mouvements/route.ts` (L74, L88)
- **Statut :** [ ]

### P3-008 : Action de log sync inexacte

- **Source(s) :** SYNC-003
- **Description :** L'action de log pour la synchronisation est `CASH_MOVEMENT_CREATED`, inexact pour un batch de sync.
- **Fichier(s) :** `web/app/src/app/api/comptoir/sync/route.ts` (L102)
- **Statut :** [ ]

### P3-009 : Types de retour explicites sur routes API

- **Source(s) :** QUAL-009
- **Description :** Aucune route API n'a de type de retour explicite (`GET`, `POST`). TypeScript infere correctement mais les conventions demandent un type explicite.
- **Fichier(s) :** Toutes les routes API
- **Statut :** [ ]

### P3-010 : Tests RTL composants secondaires + tests Cypress supplementaires

- **Source(s) :** Rapport 03 (tests)
- **Description :** Tests RTL pour composants secondaires (CategoryManager, MovementForm, ProductsTable/Grid, StockAlertBadge, VenteFilterDate). Tests Cypress pour parametres et modes de paiement.
- **Fichier(s) :** Creer dans `web/app/src/__tests__/components/` et `web/app/cypress/e2e/`
- **Statut :** [ ]

---

## Metriques cibles

| Metrique | Valeur actuelle | Cible | Atteinte |
|----------|----------------|-------|----------|
| Couverture Vitest | Non mesuree (provider non configure) | >= 80% | [ ] |
| Failles critiques ouvertes | 7 (5 metier + 2 securite) | 0 | [ ] |
| Failles hautes ouvertes | 13 (7 metier + 4 securite + 2 qualite) | 0 | [ ] |
| Tests en echec | 6 | 0 | [ ] |
| Tests RTL composants critiques | 0 | >= 5 composants couverts | [ ] |
| Flux financiers testes e2e | Partiel (mocks, pas d'integration) | 100% | [ ] |
| Tests Vitest total | 650 passants / 656 | Tous verts | [ ] |
| ESLint erreurs | Non mesure | 0 | [ ] |
| TypeScript erreurs (tsc --noEmit) | Non mesure | 0 | [ ] |

---

## Repartition par vague d'execution

### Vague 2 -- Corrections critiques (P0 + P1)

| Agent | Tickets assignes |
|-------|-----------------|
| **Exec-Finance** | P0-001, P0-002, P0-003, P0-004, P0-005, P1-001, P1-002, P1-003, P1-004, P1-005, P1-009 |
| **Exec-Securite** | P0-006, P0-007, P1-006, P1-007, P1-008, P1-010 |
| **Exec-Tests-Critiques** | P1-011, P1-012, P1-013 |

### Vague 3 -- Refactorisations & couverture (P2 + P3)

| Agent | Tickets assignes |
|-------|-----------------|
| **Refac-Code** | P2-001, P2-003, P2-012, P2-014, P3-004, P3-005, P3-006, P3-007, P3-008, P3-009 |
| **Refac-Pages** | P2-006, P2-007, P2-008, P2-011, P3-002, P3-003 |
| **Tests-Completion** | P2-002, P2-004, P2-005, P2-009, P2-010, P2-013, P3-001, P3-010 |

---

*Plan consolide -- AerisPay Audit -- 4 mai 2026*
