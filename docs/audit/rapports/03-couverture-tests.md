# Rapport d'Audit — Couverture de Tests

> **Agent :** Agent 3
> **Date :** 2026-05-04
> **Statut :** TERMINE

---

## Resume executif

L'application AerisPay dispose de **51 fichiers de tests Vitest** et **11 specs Cypress e2e**, totalisant **656 tests unitaires/integration** (dont 6 en echec) et environ **72 assertions Cypress**. La couverture porte essentiellement sur les **API Routes** (bien couvertes) et les **services metier** (bien couverts). En revanche, il n'existe **aucun test RTL (React Testing Library)** pour les composants UI critiques (Cart, PaymentModal, POSInterface, ProductForm, SessionManager). Le flux financier de bout en bout est teste partiellement : les etapes individuelles sont couvertes par des tests unitaires mockes, mais **aucun test d'integration veritable** ne traverse la chaine complete (panier -> vente -> stock -> mouvement caisse -> ticket). Le store Zustand `cartStore` n'a **aucun test**. Six tests sont en echec sur `dashboard/kpis-api` et `comptoir/sessions-id-api`.

**Score global estime : 65/100** — Bonne couverture API, mais trous critiques sur les composants UI, le store panier, et les tests d'integration financiere.

---

## 1. Metriques de couverture actuelles

```
Couverture globale : Non mesuree (--coverage echoue, pas de provider configure)
  Statements : N/A
  Branches   : N/A
  Functions  : N/A
  Lines      : N/A

Resultats Vitest (run du 2026-05-04) :
  Fichiers de test : 51 (49 passes, 2 en echec)
  Tests            : 656 (650 passes, 6 en echec)
  Assertions       : ~949 expect() dans les tests Vitest
  Duree            : 4.63s

Tests en echec :
  - dashboard/kpis-api.test.ts (4 tests) : KPIs ADMIN/MANAGER + cashDiscrepancy → status 500 au lieu de 200
  - comptoir/sessions-id-api.test.ts (2 tests) : GET session avec soldeTheoriqueCash → status 500 au lieu de 200
```

---

## 2. Inventaire des tests existants

### Tests Vitest (51 fichiers)

| Fichier de test | Module | Routes/Services couverts | Qualite |
|-----------------|--------|--------------------------|---------|
| auth/authorize.test.ts | Auth | Logique authorize (credentials) | Bonne — 11 cas, verifie email/password/role/inactif |
| auth/callbacks.test.ts | Auth | JWT + Session callbacks | Bonne — 10 cas, verifie enrichissement token et session |
| auth/middleware.test.ts | Auth | Middleware routing logic | Bonne — 16 cas, couvre auth/non-auth, redirect, API |
| auth/roles.test.ts | Auth | Matrice RBAC (AUTH.md §3) | Bonne — 30 assertions, 3 roles x 8 permissions + hasRole |
| auth/access-control.test.ts | Auth | Controle acces Stock/POS/Sessions par role | Bonne — 11 cas, verifie CAISSIER/ADMIN/MANAGER |
| ventes/api.test.ts | Ventes | GET/POST /api/ventes, GET/POST /api/ventes/[id], POST /api/ventes/[id]/annuler | Bonne — 39 assertions, auth+RBAC+validation+transaction+annulation |
| ventes/sale-creation.test.ts | Ventes | POST /api/ventes (creation detaillee) | Bonne — 26 assertions, taxes, stock insuffisant, produit inactif, paiement insuffisant |
| comptoir/api.test.ts | Comptoir | GET/POST /api/comptoir/sessions, PUT /api/comptoir/sessions/[id] | Bonne — 26 assertions, ouverture/fermeture session, RBAC, caisse active |
| comptoir/sessions-id-api.test.ts | Comptoir | GET/PUT /api/comptoir/sessions/[id] | Moyenne — 16 assertions, 2 tests en echec (500 au lieu de 200) |
| comptoir/discrepancies-api.test.ts | Comptoir | GET /api/comptoir/discrepancies | Bonne — 10 assertions, controle acces ADMIN/MANAGER |
| comptoir/discrepancies-recurring-api.test.ts | Comptoir | GET /api/comptoir/discrepancies/recurring | Bonne — 11 assertions |
| comptoir/session-movements-api.test.ts | Comptoir | GET /api/comptoir/sessions/[id]/movements | Bonne — 8 assertions |
| comptoir/sync-api.test.ts | Comptoir | POST /api/comptoir/sync | Bonne — 19 assertions, sync offline mouvements |
| comptoir/z-report-api.test.ts | Comptoir | GET /api/comptoir/sessions/[id]/z-report | Bonne — 14 assertions |
| comptoir/ticket-page.test.ts | Comptoir | Page ticket (donnees) | Bonne — 12 assertions |
| stock/produits-api.test.ts | Stock | GET/POST /api/produits, GET/PUT/DELETE /api/produits/[id] | Excellente — 48 assertions, pagination, filtres, tri, recherche, barcode |
| stock/categories-api.test.ts | Stock | GET/POST /api/categories, PUT/DELETE /api/categories/[id] | Bonne — 24 assertions, CRUD complet + doublons + cascade |
| stock/mouvements-api.test.ts | Stock | GET/POST /api/stock/mouvements, GET /api/stock/alertes | Bonne — 25 assertions, ENTREE/SORTIE/PERTE/AJUSTEMENT + filtres |
| stock/alertes-api.test.ts | Stock | GET /api/stock/alertes | Bonne — 6 assertions, seuils rupture/alerte |
| users/api.test.ts | Users | GET/POST /api/users, GET/PUT /api/users/[id] | Bonne — 35 assertions, hash password, ADMIN only, desactivation |
| activity-logs/api.test.ts | Logs | GET /api/activity-logs | Bonne — 13 assertions, filtres action/actorId/date/entityType |
| activity-logs/detail-page.test.ts | Logs | Page detail log | Bonne — 14 assertions |
| activity-logs/logging.test.ts | Logs | Integration logActivity | Bonne — 16 assertions |
| dashboard/kpis-api.test.ts | Dashboard | GET /api/dashboard/kpis | Moyenne — 39 assertions, 4 tests en echec (cashDiscrepancy) |
| tickets/pdf-api.test.ts | Tickets | GET /api/tickets/[id]/pdf | Excellente — 17 assertions, headers PDF, parametres commerce, taxesDetail |
| hardware/api.test.ts | Hardware | POST /api/tickets/[id]/print, POST /api/cash-drawer/open | Bonne — 9 assertions, auth + succes/echec imprimante/tiroir |
| parametres/api.test.ts | Parametres | GET/PUT /api/parametres | Bonne — 13 assertions, RBAC ADMIN only pour PUT |
| parametres/modes-paiement-api.test.ts | Parametres | GET/POST /api/parametres/modes-paiement | Bonne — 30 assertions |
| parametres/modes-paiement-validation.test.ts | Parametres | Validation Zod modes paiement | Bonne — 11 assertions |
| taxes/api.test.ts | Taxes | GET/POST /api/taxes | Bonne — 13 assertions |
| taxes/taxes-id-api.test.ts | Taxes | GET/PUT/DELETE /api/taxes/[id] | Bonne — 8 assertions |
| caisse/caisse-api.test.ts | Caisse | GET/POST /api/caisse, GET /api/caisse/[id]/mouvements, GET /api/caisse/[id]/soldes | Bonne — 28 assertions, seuils, permissions |
| caisse/movements-api.test.ts | Caisse | POST /api/comptoir/movements | Bonne — 25 assertions, APPORT/RETRAIT/DEPENSE, seuils |
| caisse/closure-api.test.ts | Caisse | POST /api/comptoir/sessions/[id]/closure | Bonne — 22 assertions, declaration caissier, soldes par mode |
| caisse/validate-api.test.ts | Caisse | POST /api/comptoir/sessions/[id]/validate | Bonne — 25 assertions, validation aveugle, reconciliation |
| caisse/phase6-api.test.ts | Caisse | POST force-close, POST correct | Bonne — 29 assertions, force close + correction session |
| caisse/integrity.test.ts | Caisse | computeSessionHash pure function | Bonne — 8 assertions, determinisme, sensibilite aux changements |
| caisse/reconciliation.test.ts | Caisse | reconcile() service | Bonne — 21 assertions, 6 cas metier (match, mineur, majeur, recount) |
| caisse/permissions.test.ts | Caisse | Permissions module caisse (SPEC §9) | Bonne — 21 assertions, 3 roles x 7 permissions |
| caisse/activity-log-actions.test.ts | Caisse | Constantes ACTIONS module caisse | Superficielle — 6 expect, verifie juste que les constantes existent |
| caisse/event-emitter.test.ts | Caisse | EventEmitterService | Bonne — 14 assertions, emit/list/markConsumed |
| caisse/offline-store.test.ts | Caisse | Zustand offlineStore | Bonne — 21 assertions, online/offline/queue/sync |
| caisse/validations.test.ts | Caisse | Schemas Zod mouvement caisse | Bonne — 28 assertions, 5 schemas testes |
| caisse/list-movements-api.test.ts | Caisse | GET /api/caisse/[id]/mouvements | Bonne — 22 assertions |
| lib/activity-log.test.ts | Lib | logActivity, getClientIp, getClientUserAgent | Bonne — 9 assertions, resilience erreur DB, truncation UA |
| lib/utils.test.ts | Lib | cn, formatMontant, formatDate, formatDateTime, genererNumeroVente, genererReference | Bonne — 19 assertions |
| lib/validations.test.ts | Lib | createProductSchema, updateProductSchema, createMouvementSchema, updateUserSchema | Bonne — 16 assertions |
| lib/cash-movement.test.ts | Lib | Service cash-movement (createMovementInTx, computeSolde*, list*) | Bonne — 13 assertions, calcul solde par mode |
| lib/integrity-service.test.ts | Lib | computeHashForSession, verifySessionIntegrity | Bonne — 15 assertions, chainage hash, verification |
| lib/seed-parametres.test.ts | Lib | seedDefaultParametres | Correcte — 4 assertions, verifie upsert + modes paiement |
| lib/seuils.test.ts | Lib | getSeuil, invalidateSeuilsCache | Bonne — 6 assertions, cache TTL, invalidation |

### Tests Cypress e2e (11 specs)

| Fichier spec | Module | Parcours couverts | Qualite |
|--------------|--------|-------------------|---------|
| auth/login.cy.ts | Auth | Formulaire login, credentials invalides, login admin, redirect session active | Bonne — 5 tests, assertions UI + redirect |
| stock/stock.cy.ts | Stock | Navigation sidebar, liste produits, detail, creation, categories, mouvements, API CRUD | Bonne — 10 tests, couvre navigation + API |
| ventes/ventes.cy.ts | Ventes | Page ventes CAISSIER/MANAGER, creation vente via API, annulation CAISSIER 403, annulation MANAGER UI | Excellente — 5 tests, flux complet avec annulation |
| comptoir/session-flow.cy.ts | Comptoir | Ouverture session, 409 double session, redirect sans session, cloture avec ecart, cloture equilibree, deconnexion avec session ouverte | Excellente — 6 tests, flux caissier complet |
| comptoir/ecarts.cy.ts | Comptoir | Ecart manquant + modale, fermeture sans ecart, dashboard admin ecarts, page ecarts detailles, warning ouverture | Excellente — 5 tests, flux ecarts complet |
| dashboard/dashboard.cy.ts | Dashboard | Affichage par role, API KPIs 200/401 | Correcte — 6 tests, assertions minimales |
| users/management.cy.ts | Users | Acces par role, liste, creation, doublon email, desactivation/reactivation, API protection | Excellente — 10 tests, CRUD complet + RBAC |
| activity-logs/activity-logs.cy.ts | Logs | Acces par role, logging auth/produit/stock, page filtres/affichage, IP column visibility, no secrets | Excellente — 11 tests, verification audit trail |
| taxes/taxes.cy.ts | Taxes | Acces par role, API CRUD, validation, UI form add/edit/delete, activity log integration | Excellente — 16 tests, CRUD complet + UI + audit |
| tickets/tickets.cy.ts | Tickets | Page ticket display, business info, PDF API auth/404/200/content-type, taxes on ticket, thermal print API | Excellente — 14 tests, PDF + impression + taxes |
| caisse/caisse.cy.ts | Caisse | API mouvements, soldes, controle acces discrepancies | Bonne — 6 tests, API endpoints |

---

## 3. Matrice de couverture — API Routes

| Route | Methode | Test Vitest | Test Cypress | Commentaire |
|-------|---------|-------------|--------------|-------------|
| /api/ventes | GET | OUI (7 tests) | OUI | Pagination, filtres, RBAC CAISSIER scope |
| /api/ventes | POST | OUI (12 tests) | OUI | Transaction, stock, taxes, paiement |
| /api/ventes/[id] | GET | OUI (4 tests) | OUI (via detail page) | Auth + 404 + detail |
| /api/ventes/[id]/annuler | POST | OUI (9 tests) | OUI | RBAC 403 CAISSIER, transaction, restauration stock |
| /api/comptoir/sessions | GET | OUI (3 tests) | OUI | Auth + liste |
| /api/comptoir/sessions | POST | OUI (10 tests) | OUI | RBAC CAISSIER only, caisse active, solde, 409 |
| /api/comptoir/sessions/[id] | GET | OUI (5 tests) | NON | 2 tests en echec (500) |
| /api/comptoir/sessions/[id] | PUT | OUI (10 tests) | OUI (via cloture) | Ecart calcule, RBAC |
| /api/comptoir/sessions/[id]/closure | POST | OUI (closure-api) | OUI (via session-flow) | Declaration caissier |
| /api/comptoir/sessions/[id]/validate | POST | OUI (validate-api) | NON | Validation aveugle, reconciliation |
| /api/comptoir/sessions/[id]/force-close | POST | OUI (phase6-api) | NON | ADMIN only |
| /api/comptoir/sessions/[id]/correct | POST | OUI (phase6-api) | NON | Session corrective |
| /api/comptoir/sessions/[id]/verify | GET | NON | NON | Verification integrite — PAS DE TEST |
| /api/comptoir/sessions/[id]/z-report | GET | OUI (z-report-api) | NON | Rapport Z session |
| /api/comptoir/sessions/[id]/movements | GET | OUI (session-movements-api) | OUI | Mouvements par session |
| /api/comptoir/movements | GET/POST | OUI (movements-api) | OUI | APPORT/RETRAIT/DEPENSE |
| /api/comptoir/discrepancies | GET | OUI (discrepancies-api) | OUI | RBAC ADMIN/MANAGER |
| /api/comptoir/discrepancies/recurring | GET | OUI (discrepancies-recurring-api) | NON | Ecarts recurrents |
| /api/comptoir/sync | POST | OUI (sync-api) | NON | Sync offline |
| /api/produits | GET | OUI (14 tests) | OUI | Pagination, filtres, tri, recherche |
| /api/produits | POST | OUI (8 tests) | OUI | Validation, barcode, categorie |
| /api/produits/[id] | GET | OUI (3 tests) | OUI (via detail) | Auth + 404 |
| /api/produits/[id] | PUT | OUI (8 tests) | NON | Prix, barcode conflict, soft delete |
| /api/produits/[id] | DELETE | OUI (4 tests) | NON | Soft delete (actif=false) |
| /api/categories | GET | OUI (2 tests) | OUI | Auth + liste |
| /api/categories | POST | OUI (6 tests) | OUI (via logs) | RBAC, doublon nom |
| /api/categories/[id] | PUT | OUI (4 tests) | NON | RBAC, 404, doublon |
| /api/categories/[id] | DELETE | OUI (4 tests) | NON | Cascade produits |
| /api/stock/mouvements | GET | OUI (7 tests) | OUI | RBAC, filtres produit/date/type |
| /api/stock/mouvements | POST | OUI (10 tests) | OUI (via logs) | ENTREE/SORTIE/PERTE/AJUSTEMENT |
| /api/stock/alertes | GET | OUI (4 tests) | OUI | Seuils rupture/alerte |
| /api/users | GET | OUI (4 tests) | OUI | ADMIN only, pagination, sans motDePasse |
| /api/users | POST | OUI (5 tests) | OUI | ADMIN only, hash, doublon email |
| /api/users/[id] | GET | OUI (4 tests) | NON | ADMIN only, sans motDePasse |
| /api/users/[id] | PUT | OUI (5 tests) | OUI (desactivation) | ADMIN only, hash password |
| /api/activity-logs | GET | OUI (8 tests) | OUI | RBAC ADMIN/MANAGER, filtres |
| /api/dashboard/kpis | GET | OUI (12 tests) | OUI | 4 tests en echec — cashDiscrepancy |
| /api/taxes | GET | OUI (taxes/api) | OUI | Auth |
| /api/taxes | POST | OUI (taxes/api) | OUI | ADMIN only, validation |
| /api/taxes/[id] | GET/PUT/DELETE | OUI (taxes-id-api) | OUI | CRUD complet |
| /api/parametres | GET | OUI (4 tests) | NON | Auth, defauts si vide |
| /api/parametres | PUT | OUI (6 tests) | NON | ADMIN only, validation |
| /api/parametres/modes-paiement | GET/POST | OUI (30 tests) | NON | CRUD modes paiement |
| /api/parametres/modes-paiement/[code] | PUT/DELETE | Partiel | NON | Via modes-paiement-api |
| /api/tickets/[id]/pdf | GET | OUI (11 tests) | OUI | Headers PDF, business info, taxes |
| /api/tickets/[id]/print | POST | OUI (5 tests) | OUI | Auth, 200/503/500 |
| /api/cash-drawer/open | POST | OUI (4 tests) | NON | Auth, 200/503/500 |
| /api/caisse | GET/POST | OUI (caisse-api) | OUI | Caisse active, soldes |
| /api/caisse/[id]/mouvements | GET/POST | OUI (list-movements-api) | OUI | Filtres, pagination |
| /api/caisse/[id]/soldes | GET | OUI (caisse-api) | OUI | Soldes par mode |
| /api/upload | POST | NON | NON | AUCUN TEST |
| /api/auth/[...nextauth] | * | Indirect (authorize/callbacks) | OUI (login) | Via tests auth unitaires |

---

## 4. Matrice de couverture — Services metier

| Service | Test Vitest | Assertions cles | Commentaire |
|---------|-------------|-----------------|-------------|
| cash-movement.ts | OUI (lib/cash-movement.test.ts) | createMovementInTx, createMovement, computeSoldeCaisseParMode, computeSoldeTheoriqueParMode, computeSoldeTheoriqueLegacy, listMovements, listCaisseMovements — 13 expect | Bonne couverture, teste les calculs de solde par mode |
| reconciliation.ts | OUI (caisse/reconciliation.test.ts) | reconcile() — 21 expect, 6 cas metier : match parfait, ecart mineur, ecart majeur, recount, valideur != caissier | Excellente couverture des regles metier |
| integrity.ts | OUI (lib/integrity-service.test.ts + caisse/integrity.test.ts) | computeHashForSession, verifySessionIntegrity, computeSessionHash — 23 expect total | Bonne couverture, chainage hash, verification, determinisme |
| seuils.ts | OUI (lib/seuils.test.ts) | getSeuil, invalidateSeuilsCache — 6 expect, cache TTL | Bonne couverture |
| event-emitter.ts | OUI (caisse/event-emitter.test.ts) | emitEvent, listUnconsumedEvents, markEventsConsumed — 14 expect | Bonne couverture |

---

## 5. Matrice de couverture — Composants critiques

| Composant | Test RTL | Interactions testees | Commentaire |
|-----------|----------|---------------------|-------------|
| POSInterface.tsx | NON | Aucune | **CRITIQUE** — Interface POS principale sans aucun test |
| SessionManager.tsx | NON | Aucune | **CRITIQUE** — Gestion session sans test composant |
| ProductForm.tsx | NON | Aucune | Formulaire creation produit non teste |
| TicketActions.tsx | NON | Aucune | Actions ticket (PDF/imprimer) non testees |
| CancelButton.tsx | NON | Aucune | Bouton annulation vente non teste |
| VenteFilterDate.tsx | NON | Aucune | Filtre date ventes non teste |
| CategoryManager.tsx | NON | Aucune | Gestion categories non testee |
| MovementForm.tsx | NON | Aucune | Formulaire mouvement stock non teste |
| MovementTable.tsx | NON | Aucune | Tableau mouvements non teste |
| ProductsTable.tsx | NON | Aucune | Tableau produits non teste |
| ProductsGrid.tsx | NON | Aucune | Grille produits non testee |
| StockAlertBadge.tsx | NON | Aucune | Badge alerte stock non teste |

**Constat : ZERO test RTL dans l'ensemble du projet.** Tous les tests de composants sont absents. Le fichier `setup.ts` importe `@testing-library/jest-dom/vitest` mais aucun test ne l'utilise.

---

## 6. Flux financier — Test de bout en bout

| Etape | Teste ? | Comment |
|-------|---------|---------|
| Ajout produit au panier | **NON** | `cartStore.ts` n'a AUCUN test. Le store Zustand du panier (ajout, suppression, modification quantite, calcul totaux) est totalement non couvert. |
| Calcul sous-total + taxes + remise | **PARTIELLEMENT** | Tests unitaires dans `sale-creation.test.ts` verifient le calcul des taxes (TVA, AIB) et la remise sur la base imposable. Mais le calcul est teste via des mocks de transaction, pas sur la logique pure. |
| Soumission paiement | **OUI (mock)** | `ventes/api.test.ts` et `sale-creation.test.ts` testent POST /api/ventes avec validation paiement insuffisant. Mais `PaymentModal` n'a aucun test composant. |
| Creation vente en base | **OUI (mock)** | La transaction `prisma.$transaction` est verifiee comme appelee. Les mocks retournent la vente creee. Le test Cypress `ventes.cy.ts` cree une vraie vente via API. |
| Decrementation stock | **PARTIELLEMENT** | `sale-creation.test.ts` teste le cas stock insuffisant (422) et produit inactif (422). Mais l'assertion que `produit.update` est appele avec `stockActuel - quantite` n'est PAS faite — la transaction est mockee globalement. |
| Creation mouvements stock | **NON VERIFIE** | Aucun test ne verifie que `mouvementStock.create` est appele dans la transaction de vente avec les bonnes valeurs (quantiteAvant, quantiteApres, type VENTE). |
| Creation mouvement caisse | **NON VERIFIE** | `createMovementInTx` est mocke dans les tests de vente. Aucune assertion ne verifie que le mouvement caisse VENTE est cree avec le bon montant et mode. |
| Generation ticket PDF | **OUI** | `tickets/pdf-api.test.ts` teste la generation PDF avec business info et taxes. Cypress teste aussi le download. |
| Annulation vente + restauration stock | **PARTIELLEMENT** | `ventes/api.test.ts` teste l'annulation : verifie status ANNULEE, transaction appelee. Un test detaille verifie que `tx.produit.update` et `tx.mouvementStock.create` sont appeles via la transaction. Cypress teste l'annulation UI par MANAGER. |

**Resume flux financier :** Les etapes individuelles sont testees en isolation avec des mocks, mais il n'y a pas de test d'integration qui verifie la coherence de bout en bout (ex: stock avant vente = X, apres vente = X - quantite, apres annulation = X).

---

## 7. Qualite des tests existants

### Problemes detectes

- **Mocks trop larges :** Tous les tests API mockent `prisma` globalement avec `vi.mock("@/lib/db")`. Les transactions (`$transaction`) sont mockees avec des callbacks qui simulent le comportement interne, mais ne garantissent pas que le code de production appelle correctement les methodes dans le bon ordre. Si l'implementation change l'ordre des operations dans la transaction, les tests passeront toujours.

- **6 tests en echec :**
  - `dashboard/kpis-api.test.ts` : 4 tests echouent (status 500 au lieu de 200) pour les scenarios ADMIN/MANAGER avec cashDiscrepancy. Cela indique que l'API a change (probablement une nouvelle dependance non mockee) sans mise a jour des tests.
  - `comptoir/sessions-id-api.test.ts` : 2 tests echouent (status 500) pour GET session avec soldeTheoriqueCash. Meme cause probable — un mock manquant.

- **Assertions parfois superficielles :**
  - `caisse/activity-log-actions.test.ts` : verifie uniquement que des constantes sont definies (`toBeDefined`), pas leur valeur ni leur usage.
  - Plusieurs tests verifient `expect(body.data).toBeDefined()` sans verifier le contenu.

- **Aucun test RTL :** L'absence totale de tests composants signifie que les interactions utilisateur (clic bouton, saisie formulaire, affichage conditionnel) ne sont verifiees que par Cypress, qui est plus lent et plus fragile.

- **cartStore non teste :** Le store Zustand le plus critique (panier POS) n'a aucun test. Les calculs de sous-total, quantites, ajout/suppression de lignes ne sont pas verifies.

- **Tests Cypress dependants de l'etat :** Plusieurs specs Cypress appellent `cy.closeOpenSessions()` et `cy.ensureCaisseFunded()` dans `beforeEach`, ce qui indique une dependance a l'etat de la base. Les tests ne sont pas entierement independants.

---

## 8. Tests prioritaires a ecrire

| Priorite | Test a creer | Module | Type (Vitest/RTL/Cypress) |
|----------|-------------|--------|---------------------------|
| P1 | Test cartStore (ajout, suppression, modification quantite, calcul sous-total, vider panier) | POS | Vitest |
| P1 | Test integration flux vente : stock decremente + mouvement stock cree dans transaction | Ventes | Vitest |
| P1 | Test integration flux vente : mouvement caisse cree avec bon montant et mode | Ventes | Vitest |
| P1 | Test annulation vente : stock restaure (assertion quantiteApres = quantiteAvant + quantite) | Ventes | Vitest |
| P1 | Corriger les 6 tests en echec (dashboard/kpis-api + comptoir/sessions-id-api) | Dashboard/Comptoir | Vitest |
| P1 | Test controle acces /api/comptoir/sessions/[id]/verify (aucun test existant) | Caisse | Vitest |
| P1 | Test controle acces /api/upload (aucun test existant) | Upload | Vitest |
| P2 | Test RTL POSInterface (affichage grille produits, ajout au panier, bouton paiement) | POS | RTL |
| P2 | Test RTL SessionManager (ouverture session, affichage session active, formulaire cloture) | Comptoir | RTL |
| P2 | Test RTL ProductForm (validation champs, soumission, erreurs) | Stock | RTL |
| P2 | Test RTL TicketActions (clic PDF, clic imprimer) | Tickets | RTL |
| P2 | Test RTL CancelButton (confirmation annulation, appel API) | Ventes | RTL |
| P2 | Test service reconciliation avec seuils reels (pas moques) | Caisse | Vitest |
| P3 | Test RTL CategoryManager | Stock | RTL |
| P3 | Test RTL MovementForm | Stock | RTL |
| P3 | Test RTL ProductsTable/ProductsGrid | Stock | RTL |
| P3 | Test RTL StockAlertBadge | Stock | RTL |
| P3 | Test RTL VenteFilterDate | Ventes | RTL |
| P3 | Test e2e Cypress parametres (page /parametres, PUT) | Parametres | Cypress |
| P3 | Test e2e Cypress modes paiement | Parametres | Cypress |

---

## 9. Recommandations

### Court terme (P1 — a faire immediatement)

1. **Corriger les 6 tests en echec.** Les tests `dashboard/kpis-api` et `comptoir/sessions-id-api` retournent 500 au lieu de 200, ce qui indique des mocks manquants ou une API modifiee. Ces tests doivent etre mis a jour pour correspondre a l'implementation actuelle.

2. **Ecrire des tests pour `cartStore.ts`.** C'est le store Zustand le plus critique de l'application. Il gere le panier POS qui est au coeur du flux financier. Tester : `addItem`, `removeItem`, `updateQuantity`, `clearCart`, calcul `total`, `itemCount`.

3. **Ajouter des assertions dans les tests de transaction de vente.** Les tests actuels verifient que `$transaction` est appele, mais pas ce qui se passe a l'interieur. Il faut verifier que : (a) `produit.update` decremente le stock, (b) `mouvementStock.create` est appele avec type VENTE, (c) `createMovementInTx` est appele avec le bon montant.

4. **Tester la route `/api/comptoir/sessions/[id]/verify`** et `/api/upload` qui n'ont aucun test.

### Moyen terme (P2 — sprint suivant)

5. **Introduire des tests RTL pour les composants critiques.** Commencer par `POSInterface`, `SessionManager`, et `ProductForm`. Ces composants sont complexes et contiennent de la logique metier (calculs, etats conditionnels) qui devrait etre verifiee independamment de Cypress.

6. **Configurer la couverture de code.** Ajouter `@vitest/coverage-v8` au projet et configurer dans `vitest.config.ts` avec des seuils minimaux. Cela permettra de suivre l'evolution de la couverture.

### Long terme (P3)

7. **Ajouter un test d'integration de bout en bout** qui traverse le flux complet en memoire (sans mock) : creation session -> ajout produit au panier -> soumission vente -> verification stock decremente -> verification mouvement stock cree -> generation PDF -> annulation -> verification stock restaure.

8. **Reduire la dependance aux mocks de transaction.** Envisager des tests d'integration avec une base SQLite en memoire ou un conteneur MySQL de test pour verifier les transactions reelles.

9. **Rendre les tests Cypress independants** en utilisant des fixtures ou un reset complet de la base entre chaque test, plutot que des helpers comme `closeOpenSessions` qui dependent de l'etat precedent.
