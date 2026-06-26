# Module Caisse & Sessions de comptoir

> Document produit dérivé du **code réel** (source de vérité). Ce document décrit
> l'**implémentation effective** telle qu'elle existe dans `web/app/src/`.
>
> Périmètre : ouverture/clôture de session de comptoir, fond de caisse (Modèle 2),
> solde théorique unifié, validation à l'aveugle, réconciliation, intégrité par hash chaîné.

---

## 1. Objectif

Le module Caisse encadre le cycle de vie d'une **session de comptoir** (un caissier qui
ouvre, encaisse, puis clôture sa caisse) et garantit la traçabilité financière :

- **Fond de caisse** rattaché à la session à l'ouverture (Modèle 2 : fond → session → levée à la clôture).
- **Solde théorique unifié** : une base de calcul unique (`computeSoldeSession`) partagée
  par la demande de clôture, la validation et le calcul d'intégrité — fin des divergences
  « clôture vs validation ».
- **Validation à l'aveugle** par un tiers (RULE-AUTH-003) suivie d'une **réconciliation**
  automatique catégorisant les écarts via des **seuils paramétrables** (zéro valeur en dur).
- **Intégrité** : chaque session finalisée porte un **hash SHA-256 chaîné** à la session
  précédente, vérifiable a posteriori.
- **Traçabilité** : toutes les actions sensibles passent par `logActivity` (journal d'audit).

Tous les montants sont en **FCFA** (entiers manipulés en `Decimal(10,2)` côté Prisma).

---

## 2. Modèle de données

`web/app/prisma/schema.prisma`

### 2.1 `Caisse` (schema.prisma:113)

| Champ | Type | Notes |
|---|---|---|
| `id` | `cuid` | PK |
| `nom` | `String` | |
| `active` | `Boolean` (def. `true`) | filtre les caisses sélectionnables ; une caisse unique active sert de fallback à l'ouverture |
| `mouvements` | `MouvementCaisse[]` | grand livre physique de la caisse |

> **Multi-caisse (livré, Lot C / F1.1, Option B)** : `ComptoirSession` porte un **`caisseId`**.
> À l'ouverture, la caisse est passée en paramètre (`caisseId`) ou résolue par fallback si une
> seule caisse active. Voir §14.

### 2.2 `ComptoirSession` (schema.prisma:126)

| Champ | Type | Rôle |
|---|---|---|
| `id` | `cuid` | PK |
| `ouvertureAt` / `fermetureAt` | `DateTime` / `DateTime?` | bornes temporelles |
| `montantOuvertureCash` | `Decimal(10,2)` | snapshot legacy (espèces déclarées à l'ouverture) |
| `montantOuvertureMobileMoney` | `Decimal(10,2)` def. 0 | snapshot legacy (somme des autres modes) |
| `declarationsOuverture` | `Json?` | `{ mode: montant }` déclarés à l'ouverture |
| `ecartsOuverture` | `Json?` | `[{ mode, theorique, declare, ecart, categorie }]` |
| `ecartOuvertureImputeSessionId` | `String?` | session précédente à laquelle un écart d'ouverture est imputé (RULE-FOND-004) |
| `declarationsCaissier` | `Json?` | déclarations de clôture (étape 1) `{ mode: montant }` |
| `demandeCloturAt` | `DateTime?` | horodatage de la demande de clôture |
| `declarationsValideur` | `Json?` | déclarations de validation à l'aveugle (étape 3) |
| `montantFermeture*`, `soldeTheorique*`, `ecart*` | `Decimal?` | champs legacy MVP (rétrocompat) |
| `ecartsParMode` | `Json?` | écarts finaux `{ mode: { theorique, declare, ecart, categorie } }` |
| `hashIntegrite` | `VarChar(64)?` | hash SHA-256 de la session finalisée |
| `hashSessionPrecedente` | `VarChar(64)?` | hash de la session précédente (chaînage) |
| `tentativesRecomptage` | `Int` def. 0 | compteur de recomptages |
| `motifForceClose` | `Text?` | motif d'une clôture forcée |
| `statut` | `StatutSession` def. `OUVERTE` | état du cycle |
| `notes` | `String?` | |
| `userId` / `user` | rel. | caissier propriétaire |
| `valideurId` / `valideur` | rel. `SessionValideur` | tiers validateur |
| `ventes` | `Vente[]` | ventes de la session |
| `mouvementsCaisse` | `MouvementCaisse[]` | mouvements rattachés |
| `sessionCorrigeeId` / `sessionCorrigee` / `sessionCorrective` | rel. `SessionCorrective` (1-1) | lien session originale ↔ corrective |

### 2.3 `StatutSession` (schema.prisma:191)

`OUVERTE` · `FERMEE` (legacy MVP) · `EN_ATTENTE_CLOTURE` · `EN_ATTENTE_VALIDATION` ·
`VALIDEE` · `CONTESTEE` · `FORCEE` · `CORRIGEE`

### 2.4 `MouvementCaisse` (schema.prisma:204)

| Champ | Type | Notes |
|---|---|---|
| `id` | `cuid` | |
| `type` | `TypeMouvementCaisse` | voir §2.5 |
| `mode` | `String` | mode de paiement (`ESPECES`, `MOBILE_MONEY_MTN`, `MOBILE_MONEY_MOOV`, `CELTIS_CASH`…) |
| `montant` | `Decimal(10,2)` | **signé** : positif = entrée, négatif = sortie |
| `motif`, `reference`, `justificatif` | `String?` / `Text?` | traçabilité |
| `offline` | `Boolean` def. false | mouvement créé hors-ligne |
| `createdAt` | `DateTime` | ordonne le grand livre et le hash |
| `caisseId` / `sessionId?` / `venteId?` / `auteurId` | rel. | rattachements |

Index sur `caisseId`, `sessionId`, `venteId`, `auteurId`, `createdAt`.

### 2.5 `TypeMouvementCaisse` (schema.prisma:232)

| Type | Signe | Origine |
|---|---|---|
| `FOND_INITIAL` | + | approvisionnement initial de la caisse (seed/admin) |
| `FOND_OUVERTURE` | + | **Lot G** : fond rattaché à la session, créé à l'ouverture |
| `LEVEE` | − | **Lot G / Modèle 2** : levée des recettes vers le coffre à la validation |
| `VENTE` | + | généré dans la transaction de vente (`api/ventes/route.ts:262`) |
| `REMBOURSEMENT` | − | remboursement |
| `APPORT` | + | apport manuel de fonds |
| `RETRAIT` | − | retrait manuel (sous garde de seuil) |
| `DEPENSE` | − | dépense (sous garde de seuil) |
| `CORRECTION` | ± | mouvement d'une session corrective |

### 2.6 `SeuilCaisse` (schema.prisma:246)

`{ id: String (PK = clé), valeur: Int, description?, createdAt, updatedAt }` — table des seuils
paramétrables surchargeant les valeurs par défaut du code (voir §6).

---

## 3. Cycle de vie d'une session

```
                         POST /sessions
                    (déclarations + fond)
                              │
                              ▼
                         ┌─────────┐
                         │ OUVERTE │◄──────────────┐ DELETE /closure
                         └─────────┘               │ (annulation, si
                              │                     │  pas encore validée)
            POST /[id]/closure (déclarations       │
              caissier, étapes 1+2 fusionnées)     │
                              ▼                     │
                  ┌────────────────────────┐       │
                  │ EN_ATTENTE_VALIDATION   │───────┘
                  └────────────────────────┘
                              │
            POST /[id]/validate (validation à l'aveugle par un tiers)
                              │
            ┌─────────────────┼──────────────────────┐
            ▼                 ▼                        ▼
        VALIDATED        RECOUNT_NEEDED            DISPUTED
            │             (reste EN_ATTENTE,           │
            │              +1 tentative, 409)          ▼
            ▼                                      ┌──────────┐
       ┌─────────┐                                 │ CONTESTEE│
       │ VALIDEE │  + levée LEVEE + hash chaîné    └──────────┘
       └─────────┘                                      │
            │                                            │ POST /[id]/force-close
            │ POST /[id]/correct (ADMIN)                 ▼
            ▼                                        ┌────────┐
       ┌──────────┐                                  │ FORCEE │ + hash
       │ CORRIGEE │ (+ session corrective VALIDEE)   └────────┘
       └──────────┘                                      │
                                                          │ POST /[id]/correct (ADMIN)
                                                          ▼
                                                     CORRIGEE
```

Notes sur les transitions réelles :

- **`OUVERTE → EN_ATTENTE_VALIDATION`** : la route `closure` combine les étapes 1 (déclarations)
  et 2 (calcul des écarts préliminaires) et bascule **directement** en `EN_ATTENTE_VALIDATION`
  (`closure/route.ts:91-103`). Le statut `EN_ATTENTE_CLOTURE` existe dans l'enum mais n'est plus
  un état stable transité par ce flux ; il reste accepté en entrée de `force-close` et `DELETE /closure`.
- **`force-close`** est admis depuis `OUVERTE`, `EN_ATTENTE_CLOTURE`, `EN_ATTENTE_VALIDATION`,
  `CONTESTEE` (`force-close/route.ts:8`).
- **`correct`** (session corrective) est admis depuis `VALIDEE` ou `FORCEE`
  (`correct/route.ts:9`) et fait passer l'originale en `CORRIGEE`.
- **`FERMEE`** est le statut produit par l'ancien `PUT /sessions/[id]` (flux MVP mono-étape,
  conservé pour rétrocompatibilité — `[id]/route.ts:142-200`).

---

## 4. Ouverture de session

`web/app/src/app/api/comptoir/sessions/route.ts` — `POST` (ligne 40)

Permission requise : `comptoir:vendre` (CAISSIER, MANAGER, ADMIN).

Déroulé :

1. **Validation Zod** du corps (`openSessionSchema`) : `{ declarations: { mode: montant }, confirmeEcart?: boolean }`.
2. **Caisse** : `caisseId` fourni en paramètre (validé actif), sinon **fallback** sur l'unique caisse active ; `409` « caisseId requis » si plusieurs caisses actives, `422` si aucune (`route.ts:62-86`).
3. **Solde caisse > 0** : la somme du grand livre (`computeSoldeCaisseParMode`) doit être
   strictement positive, sinon `422` (« effectuez un apport de fonds d'abord »).
4. **Écart d'ouverture catégorisé** : pour chaque mode, `ecart = declare − theorique`
   (théorique = solde du grand livre). Tout écart `> 0.01` est catégorisé via
   `categorizeDiscrepancy` avec les seuils `THRESHOLD_DISCREPANCY_MINOR` /
   `THRESHOLD_DISCREPANCY_MEDIUM` (route.ts:85-105).
5. **Confirmation** : s'il existe des écarts et que `confirmeEcart` n'est pas vrai, réponse
   `409 { requiresConfirmation: true, ecarts }` (le client doit reconfirmer).
6. **Imputation (RULE-FOND-004)** : si écarts, l'`ecartOuvertureImputeSessionId` pointe vers
   la dernière session finalisée (`VALIDEE|FORCEE|CORRIGEE|FERMEE`) — l'écart de fond est
   attribué à la session précédente, pas à la nouvelle (route.ts:136-143).
7. **Unicité atomique (RULE-CAISSE-002, Option B — multi-caisse)** : dans une `$transaction`,
   vérification qu'aucune session `OUVERTE` n'existe **pour cette caisse** (`CAISSE_DEJA_OUVERTE`)
   **ni pour ce caissier** (`CAISSIER_SESSION_DEJA_OUVERTE`) ; sinon `409` (route.ts:168-226).
8. **Fond d'ouverture (RULE-FOND-001)** : pour chaque mode déclaré > 0, création d'un
   mouvement `FOND_OUVERTURE` rattaché à la session. Le fond devient donc un mouvement,
   inclus nativement par `computeSoldeSession` (route.ts:169-181).
9. **Journal** : `COMPTOIR_SESSION_OPENED` avec déclarations et écarts.

Réponse : `201 { data: session }`.

---

## 5. Fond de caisse — Modèle 2 (fond → session → levée)

Le « Modèle 2 » remplace le fond global par un fond **rattaché à la session** :

| Étape | Mécanisme | Code |
|---|---|---|
| **Ouverture** | déclarations → mouvements `FOND_OUVERTURE` (un par mode > 0) | `sessions/route.ts:169` |
| **Pendant la session** | ventes, apports, retraits, dépenses s'accumulent comme mouvements scopés à la session | `cash-movement.ts` |
| **Validation** | **levée `LEVEE`** : par mode, un mouvement négatif ramène le solde de session au **float** configurable | `validate/route.ts:116-132`, `cash-movement.ts:142` |

`leverRecettesInTx` (`cash-movement.ts:142`) calcule `aLever = solde − float(mode)` et, si
positif, crée un mouvement `LEVEE` de `−aLever` (motif « Levée des recettes vers le coffre »,
justificatif tracé). **Après la levée : `soldeSession(mode) == float(mode)`.**

Le **float par mode** est lu via `getSeuilOrZero("FLOAT_<MODE>")` (`validate/route.ts:123`),
**défaut 0** = remise à zéro complète (refloat). La levée est créée **dans la transaction de
finalisation et AVANT le calcul du hash**, pour que l'intégrité couvre les mouvements `LEVEE`.

---

## 6. Solde théorique unifié

`web/app/src/lib/services/cash-movement.ts`

La pièce centrale du refactoring est **`computeSoldeSession(sessionId)`** (cash-movement.ts:130),
définie comme :

```
soldeTheoriqueSession(mode) = Σ MouvementCaisse(session, mode)
```

Comme le `FOND_OUVERTURE` et la `LEVEE` sont des mouvements rattachés à la session, ils sont
inclus **nativement et exactement une fois**. C'est la **base unique** consommée par :

- la demande de clôture — `closure/route.ts:56`
- la validation à l'aveugle — `validate/route.ts:76`
- (la levée, via la variante transactionnelle `computeSoldeSessionInTx` — cash-movement.ts:179)

Autres fonctions de solde et leur rôle distinct :

| Fonction | Portée | Usage |
|---|---|---|
| `computeSoldeSession` / `computeSoldeTheoriqueParMode` | Σ mouvements **de la session** | base théorique unifiée (clôture = validation) |
| `computeSoldeCaisseParMode` | Σ mouvements **de la caisse** (grand livre physique) | garde solde > 0 à l'ouverture, garde de retrait, montant attendu legacy |
| `computeSoldeTheoriqueLegacy` | session, agrégé cash / mobileMoney | rétrocompat champs MVP |

> ⚠️ `computeSoldeCaisseParMode` (grand livre) **ne doit pas** servir de théorique de session :
> commentaire explicite cash-movement.ts:74-79. Le théorique de session est scopé à la session.

---

## 7. Demande de clôture (étape 1)

`web/app/src/app/api/comptoir/sessions/[id]/closure/route.ts`

- **`POST`** (closure/route.ts:14) — propriétaire de la session, ou ADMIN/MANAGER.
  - Exige `statut === OUVERTE`, sinon `422`.
  - Validation `declarationCloturSchema` : `{ declarations: { mode: montant } }`.
  - Calcule `soldesMap` via `computeSoldeSession`, puis `ecartsParMode = { theorique, declare, ecart }`.
  - Persiste `declarationsCaissier`, `demandeCloturAt`, `ecartsParMode`, soldes legacy ;
    transite en **`EN_ATTENTE_VALIDATION`** (étapes 1+2 fusionnées).
  - Journal `SESSION_CLOSURE_REQUESTED`.
- **`DELETE`** (closure/route.ts:138) — annulation de la demande.
  - Admis depuis `EN_ATTENTE_CLOTURE` ou `EN_ATTENTE_VALIDATION`, **uniquement si aucune
    validation à l'aveugle (`declarationsValideur`) n'a été soumise**, sinon `422`.
  - Repasse en `OUVERTE` et nettoie les champs de clôture.

---

## 8. Validation à l'aveugle & réconciliation

`web/app/src/app/api/comptoir/sessions/[id]/validate/route.ts`

Permission requise : `comptoir:valider_session` (MANAGER, ADMIN). Contrainte **RULE-AUTH-003** :
le validateur **ne peut pas être** le propriétaire de la session (validate/route.ts:56). Exige
`statut === EN_ATTENTE_VALIDATION`.

Le validateur soumet un **comptage à l'aveugle** `{ declarations: { mode: montant } }`. La
réconciliation (`reconciliation.ts:reconcile`) compare, par mode, le théorique de session, la
déclaration caissier et la déclaration validateur :

| Cas | Condition | `montantReference` |
|---|---|---|
| Accord exact | `|caissier − valideur| == 0` | `caissier` |
| Désaccord mineur | `|caissier − valideur| ≤ THRESHOLD_CV_TOLERANCE` | moyenne arrondie |
| Désaccord significatif | au-delà de la tolérance | déclenche recomptage / contestation |

`ecartFinal = montantReference − theorique`, catégorisé par `categorizeDiscrepancy`.

**Trois issues** (`ReconciliationResult`) :

| Issue | Effet | Statut résultant | HTTP |
|---|---|---|---|
| `VALIDATED` | levée `LEVEE` + hash chaîné + persistance `ecartsParMode` ; alerte si écart ≠ 0 | `VALIDEE` | `200` |
| `RECOUNT_NEEDED` | `tentativesRecomptage++`, `declarationsValideur` effacé pour un nouvel essai | reste `EN_ATTENTE_VALIDATION` | `409` |
| `DISPUTED` | désaccord persistant après `THRESHOLD_MAX_RECOUNT_ATTEMPTS` | `CONTESTEE` | `409` |

Sur `VALIDATED` : levée (`leverRecettesInTx`), puis `computeHashForSession`, puis update
en `VALIDEE` avec `fermetureAt`, `valideurId`, `ecartsParMode`, `hashIntegrite`. Journaux
`BLIND_VALIDATION_SUBMITTED`, `SESSION_VALIDATED`, et `DISCREPANCY_ALERT_TRIGGERED` si écart.

---

## 9. Réconciliation, seuils & écarts

### 9.1 Catégorisation (`reconciliation.ts:109`)

```
categorizeDiscrepancy(ecart, seuilMineur, seuilMajeur):
  abs == 0                 → null
  abs ≤ seuilMineur        → "MINEUR"
  abs ≤ seuilMajeur        → "MOYEN"
  sinon                    → "MAJEUR"
```

Bornes : `MINEUR` = `THRESHOLD_DISCREPANCY_MINOR`, `MOYEN` jusqu'à
`THRESHOLD_DISCREPANCY_MEDIUM`, `MAJEUR` au-delà. La même fonction sert à l'ouverture (§4) et
à la validation (§8) — logique centralisée, aucune duplication.

### 9.2 Seuils paramétrables (`seuils.ts`)

`getSeuil(id)` lit la table `SeuilCaisse` avec **cache mémoire (TTL 60 s)** et **fallback sur
les défauts en dur** ; lève une erreur si la clé est totalement inconnue. `getSeuilOrZero(id)`
retourne 0 pour les clés optionnelles (ex. `FLOAT_<MODE>`). `invalidateSeuilsCache()` réinitialise.

Valeurs par défaut (`seuils.ts:3`) :

| Clé | Défaut | Rôle |
|---|---|---|
| `THRESHOLD_DISCREPANCY_MINOR` | 500 | borne MINEUR |
| `THRESHOLD_DISCREPANCY_MEDIUM` | 5000 | borne MOYEN |
| `THRESHOLD_DISCREPANCY_MAJOR` | 5000 | (référence) |
| `THRESHOLD_RECURRING_COUNT` | 3 | récurrence d'écarts |
| `THRESHOLD_RECURRING_PERIOD_DAYS` | 7 | fenêtre de récurrence |
| `THRESHOLD_CASH_WITHDRAWAL_AUTH` | 10000 | plafond retrait CAISSIER |
| `THRESHOLD_EXPENSE_AUTH` | 5000 | plafond dépense CAISSIER |
| `THRESHOLD_MAX_RECOUNT_ATTEMPTS` | 3 | recomptages avant contestation |
| `THRESHOLD_CV_TOLERANCE` | 500 | tolérance caissier↔valideur |
| `THRESHOLD_OFFLINE_READONLY_HOURS` | 4 | mode hors-ligne |
| `FLOAT_<MODE>` | 0 (optionnel) | float conservé en caisse après levée |

### 9.3 Recomptage & contestation

Un désaccord significatif caissier↔valideur (> tolérance) renvoie `RECOUNT_NEEDED` (409) et
incrémente `tentativesRecomptage` ; au-delà de `THRESHOLD_MAX_RECOUNT_ATTEMPTS`, l'issue devient
`DISPUTED` → la session passe `CONTESTEE` (déblocable ensuite par force-close ADMIN).

### 9.4 Écart d'ouverture (imputation)

L'écart constaté à l'ouverture est imputé à la **dernière session finalisée** via
`ecartOuvertureImputeSessionId` (RULE-FOND-004, §4), de sorte qu'une nouvelle session ne porte
pas la responsabilité d'un écart hérité du tiroir précédent.

---

## 10. Force-close, sessions correctives & intégrité

### 10.1 Force-close (`force-close/route.ts`)

ADMIN uniquement (`requireRole("ADMIN")`) **avec ré-authentification par mot de passe**
(`bcrypt.compare`). Admis depuis `OUVERTE | EN_ATTENTE_CLOTURE | EN_ATTENTE_VALIDATION | CONTESTEE`.
Passe en `FORCEE` avec `motifForceClose`, `fermetureAt`, et **hash d'intégrité** calculé.
Journal `SESSION_FORCE_CLOSED`.

### 10.2 Session corrective (`correct/route.ts`)

ADMIN uniquement, **ré-authentification mot de passe**. Admise depuis `VALIDEE | FORCEE`. Elle :

- **ne modifie pas** les mouvements de la session originale ;
- crée une **nouvelle session `VALIDEE`** (`sessionCorrigeeId` → originale) portant des
  mouvements `CORRECTION` ;
- passe l'originale en `CORRIGEE` ;
- impose **une seule** corrective par originale (`sessionCorrective` unique) ;
- calcule le hash de la corrective **dans la transaction** (correct/route.ts:112-117).

Journal `SESSION_CORRECTED`.

### 10.3 Intégrité — hash chaîné (`integrity.ts`)

`computeSessionHash` (integrity.ts:27) produit un **SHA-256** d'une concaténation déterministe
(séparateur `|`) de : `sessionId`, **`caisseId`** (F1.3 — lie le hash à la caisse), `userId`,
`ouvertureAt`, `validationAt`, les **mouvements**
triés par `createdAt` puis `id` (`id:type:montant:mode:createdAt`), les **déclarations caissier**
(`C:mode:montant`, triées), les **déclarations valideur** (`V:…`, omises si force-close), les
**écarts** (`E:mode:ecart`), et enfin le **hash de la session précédente** (chaînage).

`computeHashForSession` (integrity.ts:72) reconstruit cet input depuis la base et résout la
**session précédente de la même caisse** (`caisseId`) par `ouvertureAt < session.ouvertureAt`
parmi les statuts finalisés (`VALIDEE|FORCEE|CORRIGEE|FERMEE`) — chaînage **par caisse** (F1.3),
ordonné par date d'ouverture.

`verifySessionIntegrity` (integrity.ts:136) recalcule le hash et le compare au stocké →
`{ valid, storedHash, computedHash }`. Exposé par `POST /[id]/verify` (permission
`comptoir:verifier_integrite`, MANAGER/ADMIN ; statuts vérifiables :
`VALIDEE|FORCEE|CORRIGEE|FERMEE`), avec journal `INTEGRITY_CHECK_PERFORMED`.

---

## 11. Mouvements manuels & Z de caisse

### 11.1 Mouvements (`api/comptoir/movements/route.ts`)

- **`GET`** — liste paginée et filtrable (`type`, `mode`, `sessionId`, `from`/`to`). IDOR :
  un CAISSIER ne voit que les mouvements de **ses** sessions (movements/route.ts:35).
- **`POST`** — création d'un mouvement manuel ; permission `comptoir:mouvement_manuel`.
  Exige une session **`OUVERTE`**. Signe : `APPORT` positif, `RETRAIT`/`DEPENSE` négatifs.
  Gardes **CAISSIER** : `RETRAIT > THRESHOLD_CASH_WITHDRAWAL_AUTH` ou
  `DEPENSE > THRESHOLD_EXPENSE_AUTH` → `403` (autorisation MANAGER/ADMIN requise). Pour
  `RETRAIT`/`DEPENSE` en `ESPECES`, vérification du **solde caisse suffisant** (grand livre).
  Journal `CASH_MOVEMENT_CREATED`.

`GET /[id]/movements` (movements/route.ts dossier session) liste les mouvements d'une session
(ordre chronologique) via `listMovements`.

### 11.2 Z de caisse (`[id]/z-report/route.ts`)

`GET` — permission `rapports:consulter` (MANAGER, ADMIN). Disponible pour
`VALIDEE|FORCEE|CORRIGEE|FERMEE`. Retourne un rapport structuré : entête session
(caissier, valideur, fond, motif force-close), agrégat ventes, **mouvements par type**, soldes
théoriques par mode, déclarations caissier/valideur, écarts, bloc intégrité
(`hash` + `hashSessionPrecedente`) et, le cas échéant, le détail de la **session corrective**.

---

## 12. Endpoints (récapitulatif)

| Méthode | Chemin | Permission / Rôle | Effet |
|---|---|---|---|
| `GET` | `/api/comptoir/sessions` | authentifié (CAISSIER ↦ ses sessions) | liste des sessions |
| `POST` | `/api/comptoir/sessions` | `comptoir:vendre` | ouverture + fond + écart d'ouverture |
| `GET` | `/api/comptoir/sessions/[id]` | authentifié (IDOR CAISSIER) | détail + soldes/écarts calculés |
| `PUT` | `/api/comptoir/sessions/[id]` | propriétaire ou ADMIN/MANAGER | clôture legacy mono-étape → `FERMEE` |
| `POST` | `/api/comptoir/sessions/[id]/closure` | propriétaire ou ADMIN/MANAGER | demande de clôture → `EN_ATTENTE_VALIDATION` |
| `DELETE` | `/api/comptoir/sessions/[id]/closure` | propriétaire ou ADMIN/MANAGER | annule la demande → `OUVERTE` |
| `POST` | `/api/comptoir/sessions/[id]/validate` | `comptoir:valider_session` (≠ propriétaire) | validation à l'aveugle + réconciliation + levée + hash |
| `POST` | `/api/comptoir/sessions/[id]/force-close` | ADMIN + mot de passe | `FORCEE` + hash |
| `POST` | `/api/comptoir/sessions/[id]/correct` | ADMIN + mot de passe | session corrective → originale `CORRIGEE` |
| `GET` | `/api/comptoir/sessions/[id]/z-report` | `rapports:consulter` | Z de caisse |
| `POST` | `/api/comptoir/sessions/[id]/verify` | `comptoir:verifier_integrite` | vérification du hash |
| `GET` | `/api/comptoir/sessions/[id]/movements` | authentifié | mouvements de la session |
| `GET` | `/api/comptoir/movements` | authentifié (IDOR CAISSIER) | mouvements (filtres + pagination) |
| `POST` | `/api/comptoir/movements` | `comptoir:mouvement_manuel` (+ gardes seuils CAISSIER) | mouvement manuel (session OUVERTE) |

Matrice des permissions clés (`web/app/src/lib/permissions.ts:24`) :

| Permission | ADMIN | MANAGER | CAISSIER |
|---|---|---|---|
| `comptoir:vendre` | ✔ | ✔ | ✔ |
| `comptoir:mouvement_manuel` | ✔ | ✔ | ✔ (sous seuils) |
| `comptoir:valider_session` | ✔ | ✔ | ✗ |
| `comptoir:verifier_integrite` | ✔ | ✔ | ✗ |
| `rapports:consulter` | ✔ | ✔ | ✗ |
| `comptoir:force_close` | ✔ | ✗ | ✗ |
| `comptoir:session_corrective` | ✔ | ✗ | ✗ |

---

## 13. Tests existants

`web/app/src/__tests__/caisse/` :
`activity-log-actions` · `caisse-api` · **`closure-api`** · **`closure-fond-ouverture`** ·
`correct-hash-integrity` · `event-emitter` · **`fond-ouverture-mouvement`** · `integrity` ·
`levee` · `list-movements-api` · **`movements-api`** · `movements-race-condition` ·
`offline-store` · `permissions` · `phase6-api` · **`reconciliation`** · `seuils-coherence` ·
`solde-coherence` · **`validate-api`** · `validate-levee` · `validations`

`web/app/src/__tests__/comptoir/` :
`api` · `discrepancies-api` · `discrepancies-recurring-api` · **`session-caisse-unicite`** ·
`session-movements-api` · **`session-race-condition`** · `sessions-id-api` · `sync-api` ·
`sync-idempotence` · `sync-validation` · `ticket-page` · `verify-api` · `z-report-api`

Couverture notable : unicité de session ouverte et conditions de course
(`session-race-condition`, `session-caisse-unicite`), fond d'ouverture en mouvement
(`fond-ouverture-mouvement`, `closure-fond-ouverture`), levée (`levee`, `validate-levee`),
cohérence du solde unifié (`solde-coherence`, `seuils-coherence`), intégrité et hash de
correction (`integrity`, `correct-hash-integrity`).

---

## 14. Multi-caisse (livré — Lot C / F1.1, Option B)

`ComptoirSession` porte un **`caisseId`** (le `caisse.code` sert de **code poste**, fixé à
l'enrôlement en desktop). Comportement livré :

- **ouverture** : `caisseId` en paramètre, avec **fallback** sur l'unique caisse active ;
- **unicité** de session ouverte **par caisse ET par caissier** (plus de session globale unique) ;
- résolution de la caisse via `session.caisseId` dans les endpoints de session ;
- **hash d'intégrité chaîné par caisse** (`integrity.ts`, lien via `caisseId`) ;
- **numérotation des ventes par poste** `VTE-<codePoste>-YYYY-NNNNN` (voir
  [03-comptoir-ventes.md](03-comptoir-ventes.md) §6).

Architecture : [`../../ARCHITECTURE_MVP.md`](../../ARCHITECTURE_MVP.md) ; spec de conception :
`docs/superpowers/specs/2026-06-26-lot-c-multi-caisse-design.md`.
