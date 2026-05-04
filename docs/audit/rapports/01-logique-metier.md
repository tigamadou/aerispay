# Rapport d'Audit -- Logique Metier & Financier

> **Agent :** Agent 1 -- Auditeur logique metier et financiere
> **Date :** 2026-05-04
> **Statut :** TERMINE

---

## Resume executif

L'audit a porte sur l'ensemble des API Routes transactionnelles, les services metier (cash-movement, reconciliation, integrity, seuils, event-emitter), les validations Zod, le store Zustand (cartStore) et le schema Prisma. **23 problemes** ont ete identifies, dont **5 critiques**, **7 de severite haute**, **7 de severite moyenne** et **4 de severite basse**.

Les risques les plus graves concernent :
- Une **race condition** sur la generation du numero de vente qui peut produire des doublons sous charge concurrente.
- Un **caisseId vide** utilise dans les mouvements de remboursement lors d'une annulation de vente, creant des enregistrements orphelins.
- Une **incoherence de calcul** entre le cartStore (qui applique `remiseLigne` en pourcentage) et la validation Zod vente (champ `remise` sur LigneVente egalement en pourcentage mais sans borne superieure coherente avec le store).
- L'**absence de verification de session fermee** lors de l'annulation de vente -- une vente peut etre annulee meme si sa session est VALIDEE/FORCEE, faussant les soldes theoriques.
- Le **montant de remboursement** qui utilise `paiement.montant` au lieu de la part reellement couvrant la vente, ce qui peut rembourser plus que le total si le client a surpaye.

---

## 1. API Routes transactionnelles

### POST /api/ventes (creation de vente)

- **Atomicite :** Bonne. La transaction `$transaction` couvre la creation de la vente, les lignes, les paiements, le decrement de stock, les mouvements de stock et les mouvements de caisse. Le `logActivity` est en dehors de la transaction, ce qui est correct (ne doit pas bloquer la vente).
- **Gestion d'erreurs :** Correcte avec la classe `TxError`. Cependant, Prisma wraps les erreurs du callback `$transaction` -- les blocs catch post-transaction doivent faire du pattern matching sur le message, ce qui est fragile (lignes 292-302).
- **Coherence montants :** Le calcul server-side recalcule tout (sousTotal, remise, taxes, total). La `remise` provient du body en valeur fixe (pas en pourcentage), tandis que `remiseLigne` (par ligne) est en pourcentage. C'est correct mais decale par rapport au cartStore (voir section 4).
- **Probleme RACE-001 :** La generation du numero de vente via `findFirst` + increment n'est pas atomique. Deux requetes concurrentes peuvent obtenir le meme `lastSeq` et generer le meme numero. Le `@unique` sur `numero` provoquera une erreur Prisma P2002, mais elle n'est pas geree gracieusement -- elle tombera dans le catch generique "Erreur serveur".
- **Probleme CALC-001 :** Le calcul `lineSubtotal = l.prixUnitaire * l.quantite * (1 - l.remise / 100)` utilise l'arithmetique JS `number` avec possibilite de perte de precision. Le resultat est ensuite converti en `Prisma.Decimal`. Pour du FCFA (pas de decimales), la perte est theoriquement minime mais le pattern n'est pas safe.
- **Probleme MVT-001 :** Le mouvement VENTE (lignes 234-255) plafonne correctement chaque paiement au `remainingTotal`, excluant la monnaie rendue. C'est correct.

### GET /api/ventes/[id]

- **Analyse :** Pas de probleme. Lecture simple avec auth. Un CAISSIER peut voir n'importe quelle vente par ID (pas de filtre par `userId`), ce qui peut etre un souci de visibilite mais pas un risque financier.

### POST /api/ventes/[id]/annuler (annulation)

- **Restauration stock :** Correcte. Les lignes sont parcourues, le stock est incremente, les mouvements RETOUR sont crees avec `quantiteAvant` et `quantiteApres` coherents.
- **Coherence mouvements :** **Probleme critique ANNUL-001.** Le remboursement utilise `paiement.montant` (ligne 75) qui est le montant paye par le client, pas la part de la vente couverte par ce paiement. Si le client a paye 5100 FCFA pour une vente de 5000 FCFA (monnaie de 100 FCFA rendue), le remboursement sera de -5100 au lieu de -5000. Le solde de caisse sera fausse de 100 FCFA.
- **Probleme ANNUL-002 :** Le `caisseId` est obtenu via `findFirst({ where: { active: true } })` en dehors de la transaction (ligne 33). Si aucune caisse active n'existe, `caisseId` vaut `""` (chaine vide). Ce mouvement sera cree avec un `caisseId` invalide. Prisma ne le rejettera pas si pas de FK constraint violation (le `caisseId` est un `String`, non nullable, mais une chaine vide n'est pas un ID valide).
- **Probleme ANNUL-003 :** Aucune verification de l'etat de la session associee. Une vente liee a une session VALIDEE ou FERMEE peut etre annulee, ce qui modifie retroactivement les mouvements de cette session. Les soldes theoriques calcules lors de la cloture deviennent faux. Le hash d'integrite ne sera plus valide non plus.

### Sessions comptoir

#### POST /api/comptoir/sessions (ouverture)

- **Analyse :** Bonne verification de session ouverte existante. Verification du solde de caisse > 0. **Probleme SESS-001 :** La verification de solde > 0 et la creation de session ne sont pas dans une transaction. En cas de concurrence, deux caissiers pourraient ouvrir une session simultanement apres avoir vu un solde positif.
- **Probleme SESS-002 :** `requireRole("CAISSIER")` restreint l'ouverture aux seuls CAISSIER. Un ADMIN ou MANAGER ne peut pas ouvrir de session, ce qui peut etre intentionnel mais limitant.

#### PUT /api/comptoir/sessions/[id] (fermeture legacy)

- **Analyse :** Correcte pour la retrocompatibilite. Le solde theorique additionne le fond d'ouverture + les mouvements. L'ecart est correctement calcule.

#### POST /api/comptoir/sessions/[id]/closure (demande de cloture)

- **Analyse :** Le solde theorique par mode (via `computeSoldeTheoriqueParMode`) ne contient PAS le fond d'ouverture. **Probleme CLOTURE-001 :** Les soldes retournes par `computeSoldeTheoriqueParMode` ne sommant que les mouvements lies a la session (VENTE, REMBOURSEMENT, etc.) n'incluent pas le FOND_INITIAL car ce mouvement n'est pas cree a l'ouverture de session. Le fond d'ouverture est stocke sur la session (`montantOuvertureCash`), pas comme mouvement caisse. Cela signifie que les ecarts calcules dans `ecartsParMode` comparent les declarations du caissier (qui incluent le fond) aux soldes theoriques (qui ne l'incluent pas). L'ecart sera systematiquement biaise du montant du fond d'ouverture.
- **Precision :** Dans le PUT legacy (ligne 158-161), le code additionne explicitement `fondCash + solde.cash`. Mais dans la cloture multi-etapes, ce n'est PAS fait -- les `soldesParMode` sont utilises tels quels comme `theorique`.

#### POST /api/comptoir/sessions/[id]/validate (validation aveugle)

- **Analyse :** Bonne verification que le valideur n'est pas le caissier (RULE-AUTH-003). La reconciliation est correctement implementee.
- **Probleme VALID-001 :** La permission `comptoir:valider_session` est verifiee mais un `CAISSIER` est aussi autorise (ligne 22: `result.user.role !== "CAISSIER"`). Un CAISSIER quelconque (pas le proprietaire) peut valider. C'est peut-etre voulu mais pose un risque si les caissiers s'entraident pour masquer des ecarts.

#### POST /api/comptoir/sessions/[id]/correct (session corrective)

- **Analyse :** Bonne reauthentification par mot de passe. Les mouvements correctifs sont crees dans une transaction.
- **Probleme CORRECT-001 :** Comme pour ANNUL-002, le `caisseId` peut etre `""` si aucune caisse active (ligne 74). Meme probleme d'ID vide.
- **Probleme CORRECT-002 :** Le hash est calcule apres la transaction (lignes 113-117) via un `prisma.comptoirSession.update` separe. Si cette operation echoue, la session corrective existe sans hash d'integrite, mais la session originale est deja marquee CORRIGEE.

#### POST /api/comptoir/sessions/[id]/force-close

- **Analyse :** Correcte. Reauthentification, verification du statut, hash d'integrite. Pas de probleme majeur.

#### POST /api/comptoir/sessions/[id]/verify (verification integrite)

- **Analyse :** Correcte. Le hash est recalcule et compare.

#### GET /api/comptoir/sessions/[id]/z-report (ticket Z)

- **Analyse :** Lecture seule, pas de risque transactionnel. Les mouvements et ventes sont correctement agreges.

### POST /api/comptoir/movements (mouvements manuels)

- **Analyse :** Bonne verification des seuils, du solde suffisant pour les retraits.
- **Probleme MVT-002 :** La verification du solde (ligne 161-170) et la creation du mouvement (ligne 173) ne sont pas dans une transaction. Un retrait concurrent pourrait passer alors que le solde est deja insuffisant.
- **Probleme MVT-003 :** Le `computeSoldeCaisseParMode` est importe dynamiquement (ligne 162 `await import(...)`) sans raison apparente. C'est deja importe en haut du fichier `createMovement` depuis `cash-movement`. Pas un bug mais du code mort/confus.

### POST /api/caisse/[id]/mouvements

- **Analyse :** Meme logique que `/api/comptoir/movements`. Meme probleme de non-atomicite entre la verification du solde et la creation du mouvement (MVT-002 duplique).
- **Probleme CAISSE-001 :** La permission `rapports:consulter` est utilisee pour le POST (ligne 89). C'est probablement incorrect -- un POST cree un mouvement, pas une consultation. Cela signifie que seuls ADMIN/MANAGER peuvent creer des mouvements sur une caisse directement, ce qui est peut-etre voulu mais le code de permission est semantiquement faux.

### POST /api/stock/mouvements

- **Analyse :** Bonne transaction pour la mise a jour du stock. Le mouvement AJUSTEMENT utilise la quantite comme nouveau stock absolu, ce qui est une convention qui doit etre documentee.
- **Probleme STOCK-001 :** Les erreurs throw dans la transaction utilisent un objet literal `{ status, message }` au lieu d'une Error class. Bien que gere dans le catch, ce n'est pas une bonne pratique TypeScript (pas d'instance de Error, pas de stack trace).

### POST /api/comptoir/sync (synchronisation offline)

- **Probleme SYNC-001 :** La synchronisation utilise `fetch()` interne avec l'URL de la requete courante pour rejouer les operations. En production derriere un reverse proxy, `req.url` pourrait contenir l'URL interne (ex: `http://localhost:3000`) et non l'URL publique. De plus, chaque operation effectue une requete HTTP complete, multipliant la latence.
- **Probleme SYNC-002 :** Il n'y a pas de mecanisme d'idempotence reel. L'`id` offline est recu mais jamais verifie en base pour savoir si l'operation a deja ete traitee. Une resynchronisation rejouera les operations et creera des doublons.
- **Probleme SYNC-003 :** L'action de log est `CASH_MOVEMENT_CREATED` pour une operation de synchronisation, ce qui est inexact.

---

## 2. Services metier

### cash-movement.ts

- **Analyse :** Service propre et bien structure. `createMovementInTx` et `createMovement` sont des wrappers simples.
- **Probleme CASH-001 :** `computeSoldeCaisseParMode` charge TOUS les mouvements d'une caisse en memoire (ligne 80-83). Sur une caisse avec un historique long, cela peut devenir lent et consommateur de memoire. Un `groupBy` Prisma ou une requete SQL agregee serait preferable.

### reconciliation.ts

- **Analyse :** La logique de reconciliation est correcte et bien structuree.
- **Probleme RECONC-001 :** Le seuil `THRESHOLD_DISCREPANCY_MINOR` est utilise a la fois pour la tolerance de desaccord caissier/valideur (ligne 57) et pour la categorisation des ecarts finaux (ligne 71). Ce sont deux concepts differents qui devraient avoir des seuils independants. Un desaccord de 500 FCFA entre caissier et valideur peut etre acceptable, mais un ecart de 500 FCFA avec le theorique est un ecart mineur distinct.

### integrity.ts

- **Analyse :** Le hash SHA-256 est deterministe. La chaine de hachage (hash de la session precedente) est correctement implementee.
- **Probleme INTEGR-001 :** Le cast `(session.declarationsCaissier as Record<string, number>) ?? {}` (ligne 125) est dangereux. Le champ `declarationsCaissier` est de type `Json?` dans Prisma. Si la valeur est `null` (session sans declaration, comme une session force-close), le cast sera `null ?? {}` ce qui donnera `{}`. C'est correct. Mais si la valeur est un type JSON inattendu (tableau, string), le cast silencieux produira un hash incorrect sans erreur.
- **Probleme INTEGR-002 :** Pour une session FORCEE (force-close), il n'y a pas de `declarationsCaissier` ni de `declarationsValideur`. Le hash est calcule avec des objets vides. Si ulterieurement quelqu'un modifie ces champs, le hash d'integrite sera invalide sans qu'il y ait eu de fraude. Le probleme inverse est que le force-close ne stocke pas d'ecarts (pas de `ecartsParMode`), donc le hash sera calcule sans ecarts, ce qui est coherent.

### seuils.ts

- **Analyse :** Le cache en memoire avec TTL de 60s est correct. Les valeurs par defaut couvrent les cas ou la table est vide.
- **Probleme SEUIL-001 :** Le seuil `THRESHOLD_DISCREPANCY_MEDIUM` (5000) existe dans les defauts mais n'est jamais utilise. La reconciliation utilise `THRESHOLD_DISCREPANCY_MINOR` et `THRESHOLD_DISCREPANCY_MAJOR` qui ont la meme valeur par defaut (500 et 5000). Le seuil `MEDIUM` semble etre un artefact.
- **Probleme SEUIL-002 :** Le cache est un singleton en memoire du process Node.js. En cas de scaling horizontal (plusieurs instances), chaque instance aura son propre cache. Une modification de seuil en base ne sera visible qu'apres expiration du cache (60s). Acceptable pour le MVP mais a documenter.

### event-emitter.ts

- **Analyse :** Le service est correct et n'echoue jamais (catch silencieux). Les evenements sont persistes en base.
- **Observation :** Le service est defini mais jamais appele dans les routes transactionnelles examinees. Les routes utilisent `logActivity` mais pas `emitEvent`. Les evenements metier ne sont donc pas emis, ce qui rend la table `events_caisse` inutilisee.

---

## 3. Validations Zod

- **Coherence schemas <-> Prisma :**
  - `createVenteSchema.remise` est un `z.number().min(0)` sans max. Cote cartStore, la remise peut etre en pourcentage ou fixe. Cote API, `remise` est une valeur fixe (Decimal). Pas de plafond, une remise superieure au sous-total serait possible, creant un total negatif.
  - `ligneVenteSchema.remise` est `z.number().min(0).max(100)` ce qui est coherent en pourcentage.
  - `paiementSchema.montant` est `.positive()` (> 0), correct.

- **Champs manquants :**
  - `createVenteSchema` n'inclut pas de champ `taxes` ou `taxesDetail`. Les taxes sont calculees server-side depuis la config, ce qui est correct.
  - `createMouvementSchema` n'inclut pas le type `RETOUR` dans l'enum `z.enum(["ENTREE", "SORTIE", "AJUSTEMENT", "PERTE"])`. Le type RETOUR existe dans Prisma mais n'est creeable que par l'annulation de vente (usage interne). C'est correct.

- **Validations insuffisantes :**
  - **ZOD-001 :** `createVenteSchema.remise` n'a pas de borne superieure. Une remise de 1 000 000 FCFA sur un sous-total de 5 000 FCFA est acceptee par la validation. Le calcul API donnera un total negatif, mais aucun garde-fou n'empeche un total <= 0 apres remise.
  - **ZOD-002 :** `correctiveSessionSchema.mouvements[].montant` est `z.number()` sans `.positive()` ni `.nonzero()`. Un mouvement correctif de montant 0 est accepte, ce qui est inutile.

---

## 4. Store Zustand (cartStore)

- **Calculs panier :**
  - `sousTotal` : Calcule comme `sum(prixUnitaire * quantite * (1 - remiseLigne/100))`. Correct.
  - Le `sousTotal` n'est pas arrondi. En JS, `(1 - 15/100) * 3000 = 2550.0` est exact pour des multiples simples, mais `(1 - 33/100) * 1234 = 826.78` introduit des decimales.

- **Remises :**
  - La remise globale est appliquee sur le `sousTotal`. Correct.
  - **Probleme CART-001 :** Le champ `remiseGlobale` n'a pas de validation dans le store. `setRemise(150, "pourcentage")` donnerait une remise de 150%, ce qui produirait un `base` negatif dans le calcul des taxes. Le `Math.max(0, st - remise)` protege le calcul des taxes mais pas le total final : `total = sousTotal - montantRemise + montantTaxes`. Si `montantRemise > sousTotal` et `montantTaxes = 0`, le total est negatif.

- **Taxes :**
  - Chaque taxe est arrondie individuellement : `Math.round(base * (taux / 100))`. Correct pour du FCFA.

- **Arrondis FCFA :**
  - **Probleme CART-002 :** Le `sousTotal` et le `montantRemise` ne sont jamais arrondis a l'entier. Le `total()` final n'est pas arrondi non plus. En FCFA, il ne devrait jamais y avoir de decimales. Seules les taxes individuelles sont arrondies via `Math.round`. Le total final peut contenir des decimales (ex: `remiseLigne` de 33% sur 1000 FCFA = 670 FCFA, OK ; mais 33% sur 1001 FCFA = 670.67 FCFA).

- **Coherence cartStore <-> API :**
  - **Probleme CART-003 :** Le cartStore envoie `remiseLigne` (pourcentage 0-100) et l'API recoit `remise` (pourcentage 0-100 sur la ligne). C'est coherent. Mais la `remiseGlobale` du cartStore est envoyee comme `remise` (valeur fixe) a l'API. Le cartStore calcule `montantRemise` (valeur fixe si `typeRemise === "fixe"`, sinon `sousTotal * pourcentage / 100`). Le frontend doit convertir la remise globale en valeur fixe avant l'envoi. Si le frontend envoie directement `remiseGlobale` en pourcentage comme `remise` a l'API (qui l'interprete comme valeur fixe en FCFA), les montants seront faux.

---

## 5. Transactions Prisma

- **Usage de $transaction :**
  - `POST /api/ventes` : Transaction correcte couvrant toutes les operations.
  - `POST /api/ventes/[id]/annuler` : Transaction correcte pour l'annulation + restauration stock + mouvements remboursement.
  - `POST /api/stock/mouvements` : Transaction correcte pour la verification stock + mise a jour + mouvement.
  - `POST /api/comptoir/sessions/[id]/correct` : Transaction pour la session corrective + mouvements. Hash hors transaction.

- **Gestion rollback :**
  - Les transactions Prisma font un rollback automatique en cas d'erreur. Correct.
  - Le `logActivity` est systematiquement place hors transaction, ce qui est la bonne pratique.

- **Race conditions :**
  - **RACE-001** (critique) : Numero de vente genere par `findFirst` + increment dans la transaction. Bien que dans une `$transaction`, Prisma n'utilise pas de lock pessimiste par defaut. Deux transactions concurrentes lisent le meme `lastVente`, generent le meme numero, et l'une echoue sur la contrainte unique. L'erreur P2002 n'est pas geree explicitement.
  - **RACE-002** (haute) : Ouverture de session -- verification de session existante + verification de solde + creation ne sont pas atomiques.
  - **RACE-003** (moyenne) : Verification de solde suffisant pour retrait/depense + creation du mouvement ne sont pas atomiques dans les endpoints de mouvements manuels.

---

## 6. Problemes trouves

| ID | Severite | Description | Fichier(s) | Impact |
|----|----------|-------------|------------|--------|
| RACE-001 | critique | Generation du numero de vente non-atomique : `findFirst` + increment dans `$transaction` mais sans lock pessimiste. Deux ventes concurrentes peuvent generer le meme numero et la seconde echoue en P2002 non gere. | `web/app/src/app/api/ventes/route.ts` L172-180 | Perte de vente en concurrence, erreur 500 inexpliquee pour le caissier. |
| ANNUL-001 | critique | Le remboursement utilise `paiement.montant` (montant paye) au lieu de la part couvrant la vente. Si surpaiement (monnaie rendue), le remboursement depasse le total de la vente, faussant le solde de caisse. | `web/app/src/app/api/ventes/[id]/annuler/route.ts` L71-83 | Ecart de caisse negatif (argent "fantome" rembourse), perte financiere. |
| ANNUL-002 | critique | `caisseId` peut valoir `""` (chaine vide) si aucune caisse active. Le mouvement de remboursement est cree avec un caisseId invalide, orphelin dans la base. | `web/app/src/app/api/ventes/[id]/annuler/route.ts` L33-34 | Mouvements caisse introuvables, soldes fausses. |
| ANNUL-003 | critique | Pas de verification de l'etat de la session associee lors de l'annulation. Une vente d'une session VALIDEE peut etre annulee, invalidant les soldes et le hash d'integrite de cette session. | `web/app/src/app/api/ventes/[id]/annuler/route.ts` L16-29 | Integrite des sessions fermees compromise, rapports Z de caisse faux. |
| CLOTURE-001 | critique | Les soldes theoriques dans `/closure` n'incluent pas le fond d'ouverture (`montantOuvertureCash`/`MobileMoney`), contrairement au PUT legacy. Les ecarts sont systematiquement biaises du montant du fond. | `web/app/src/app/api/comptoir/sessions/[id]/closure/route.ts` L55-79 | Tous les ecarts de la cloture multi-etapes sont faux. Alerte fausse positive systematique. |
| ZOD-001 | haute | `createVenteSchema.remise` n'a pas de borne superieure. Une remise > sous-total donne un total negatif qui est accepte. | `web/app/src/lib/validations/vente.ts` L27 | Ventes a total negatif en base, pertes financieres. |
| CORRECT-001 | haute | `caisseId` peut etre `""` dans la session corrective, meme probleme que ANNUL-002. | `web/app/src/app/api/comptoir/sessions/[id]/correct/route.ts` L73-74 | Mouvements correctifs orphelins. |
| CORRECT-002 | haute | Le hash d'integrite de la session corrective est calcule et stocke apres la transaction. En cas d'echec du update hash, la session corrective existe sans hash et la session originale est marquee CORRIGEE. | `web/app/src/app/api/comptoir/sessions/[id]/correct/route.ts` L112-117 | Session corrective sans integrite verifiable. |
| MVT-002 | haute | Verification du solde suffisant pour retrait/depense et creation du mouvement ne sont pas dans une transaction. Race condition possible. | `web/app/src/app/api/comptoir/movements/route.ts` L161-183 et `web/app/src/app/api/caisse/[id]/mouvements/route.ts` L140-160 | Solde de caisse potentiellement negatif. |
| CART-002 | haute | Le total final du cartStore n'est pas arrondi a l'entier. En FCFA, des decimales ne doivent pas exister. | `web/app/src/store/cartStore.ts` L147-149 | Affichage incorrect, potentielle incoherence avec le montant API. |
| CART-003 | haute | Risque d'incoherence entre la remise globale du cartStore (pourcentage ou fixe) et le champ `remise` de l'API (valeur fixe). Le frontend doit convertir. | `web/app/src/store/cartStore.ts` et `web/app/src/lib/validations/vente.ts` | Si conversion oubliee, remise en pourcentage interpretee comme FCFA (ex: 10% -> 10 FCFA au lieu de X FCFA). |
| SYNC-001 | haute | La synchronisation offline utilise `fetch()` interne sans mecanisme d'idempotence. Les operations rejouees peuvent creer des doublons de ventes. | `web/app/src/app/api/comptoir/sync/route.ts` L44-95 | Doublons de ventes et mouvements apres resynchronisation. |
| RACE-002 | moyenne | Ouverture de session : verification de session existante + verification solde + creation non atomiques. | `web/app/src/app/api/comptoir/sessions/route.ts` L39-81 | Double session ouverte en concurrence. |
| CART-001 | moyenne | Aucune validation de la remise globale dans le store. Valeur > 100% en pourcentage possible, total negatif. | `web/app/src/store/cartStore.ts` L108-109 | Panier avec total negatif affiche au caissier. |
| CASH-001 | moyenne | `computeSoldeCaisseParMode` charge tous les mouvements en memoire. Performance degradee sur gros volumes. | `web/app/src/lib/services/cash-movement.ts` L80-83 | Lenteur progressive, timeout potentiel. |
| RECONC-001 | moyenne | Meme seuil (`THRESHOLD_DISCREPANCY_MINOR` = 500 FCFA) utilise pour la tolerance caissier/valideur ET la categorisation des ecarts finaux. | `web/app/src/lib/services/reconciliation.ts` L31-32, L57, L71 | Seuils operationnels melanges, calibration impossible independamment. |
| CAISSE-001 | moyenne | Permission `rapports:consulter` utilisee pour le POST de creation de mouvement sur caisse. Semantiquement incorrect. | `web/app/src/app/api/caisse/[id]/mouvements/route.ts` L89 | Permission trop permissive ou trop restrictive selon interpretation. |
| VALID-001 | moyenne | Un CAISSIER quelconque peut valider la session d'un autre caissier. Pas de niveau hierarchique requis. | `web/app/src/app/api/comptoir/sessions/[id]/validate/route.ts` L22 | Collusion possible entre caissiers pour masquer des ecarts. |
| ZOD-002 | basse | `correctiveSessionSchema.mouvements[].montant` accepte 0. Un mouvement correctif de montant 0 est inutile. | `web/app/src/lib/validations/mouvement-caisse.ts` L51 | Mouvements inutiles en base, bruit dans les rapports. |
| SEUIL-001 | basse | `THRESHOLD_DISCREPANCY_MEDIUM` (5000) dans les defauts de seuils.ts n'est jamais reference. Artefact. | `web/app/src/lib/services/seuils.ts` L6 | Code mort, confusion. |
| STOCK-001 | basse | Erreurs dans la transaction de mouvement stock lancees comme objet literal, pas Error class. | `web/app/src/app/api/stock/mouvements/route.ts` L74, L88 | Pas de stack trace en cas de debug. |
| SYNC-003 | basse | L'action de log pour la synchronisation est `CASH_MOVEMENT_CREATED`, inexact pour un batch de sync. | `web/app/src/app/api/comptoir/sync/route.ts` L102 | Audit trail inexact. |
| INTEGR-001 | basse | Cast non securise de `declarationsCaissier` (Json?) vers `Record<string, number>`. Si format inattendu, hash incorrect sans erreur. | `web/app/src/lib/services/integrity.ts` L125 | Hash potentiellement non deterministe en cas de donnees corrompues. |

---

## 7. Recommandations

### Corrections critiques (a traiter immediatement)

1. **RACE-001** : Remplacer la generation du numero de vente par une sequence MySQL (auto-increment dans une table dediee) ou utiliser un `SELECT ... FOR UPDATE` dans la transaction. Alternativement, ajouter un retry en cas d'erreur P2002 avec un nouveau numero.

2. **ANNUL-001** : Lors de l'annulation, le remboursement par paiement doit utiliser la meme logique que la vente : plafonner chaque remboursement au `min(paiement.montant, remainingTotal)`. Reproduire la boucle de `POST /api/ventes` (lignes 238-254) en version inversee.

3. **ANNUL-002 / CORRECT-001** : Rejeter l'operation avec une erreur 422 si aucune caisse active n'est trouvee, au lieu de proceder avec un `caisseId` vide. Ajouter un early return identique a celui de `POST /api/ventes` (lignes 94-98).

4. **ANNUL-003** : Ajouter une verification : soit interdire l'annulation de ventes dont la session est fermee/validee, soit creer une "session corrective" automatique pour absorber le remboursement.

5. **CLOTURE-001** : Dans le endpoint `/closure`, ajouter le fond d'ouverture aux soldes theoriques par mode avant de calculer les ecarts. Repliquer la logique du PUT legacy : `solde theorique = fond ouverture + sum(mouvements session)`.

### Corrections importantes (sprint suivant)

6. **ZOD-001** : Ajouter un `.refine()` sur `createVenteSchema` pour verifier que `remise <= sousTotal` calcule server-side (le check est deja implicite dans le code API mais devrait etre explicite dans la validation).

7. **MVT-002** : Encapsuler la verification de solde + creation de mouvement dans une `$transaction` avec un `SELECT ... FOR UPDATE` sur la table caisse ou utiliser un verrou applicatif.

8. **SYNC-001/002** : Implementer un mecanisme d'idempotence base sur l'ID offline : verifier en base si l'operation a deja ete traitee avant de la rejouer. Stocker les IDs offline traites dans une table dediee.

9. **CART-002/003** : Ajouter `Math.round()` sur le `total()` du cartStore. Documenter clairement que la valeur `remise` envoyee a l'API doit etre en valeur fixe FCFA (pas en pourcentage).

10. **CORRECT-002** : Deplacer le calcul et le stockage du hash a l'interieur de la transaction `$transaction`.

### Ameliorations recommandees (backlog)

11. **CASH-001** : Remplacer `findMany` + aggregation JS par un `groupBy` Prisma ou une requete SQL brute `SUM(montant) GROUP BY mode`.

12. **RECONC-001** : Creer un seuil independant `THRESHOLD_CV_TOLERANCE` pour le desaccord caissier/valideur.

13. **VALID-001** : Restreindre la validation aux roles MANAGER/ADMIN, ou au moins a un caissier designee "caissier entrant" identifie par une relation specifique.

14. **Evenements metier** : Connecter le service `event-emitter` aux routes transactionnelles pour alimenter la table `events_caisse`.
