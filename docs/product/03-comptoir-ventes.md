# Comptoir (POS) & Ventes

> Documentation **produit** dérivée du **code réel** (source de vérité). Ce document décrit
> l'implémentation effective au 26/06/2026, branche `feat/audit_refacto`.
>
> Chemins relatifs à `web/app/` sauf mention contraire.

---

## 1. Objectif

Le module Comptoir permet à un caissier connecté, à l'intérieur d'une **session de comptoir
ouverte**, de :

- composer un **panier** (produits, quantités, remise de ligne) ;
- appliquer une **remise globale** et calculer **TVA / taxes** selon le modèle de **taxe
  globale** ;
- **encaisser** un ou deux paiements (espèces, mobile money, etc.) ;
- générer une **vente** numérotée (`VTE-YYYY-NNNNN`) de manière **atomique** : création de la
  vente + lignes + paiements, décrément du stock, mouvements de stock et **mouvements de
  caisse** (alimentation du grand livre de session) ;
- consulter / filtrer les ventes et **annuler** une vente (rôle élevé), avec restitution du
  stock et remboursement caisse.

La vente est l'opération qui **relie** trois ledgers : le **stock** (`MouvementStock`), la
**caisse** (`MouvementCaisse`, base du solde théorique de session) et le **journal d'activité**
(`ActivityLog`).

---

## 2. Flux de vente

Création d'une vente — `POST /api/ventes`
(`src/app/api/ventes/route.ts:72`) :

1. **Authentification** : `requireAuth()` — tout utilisateur connecté (y compris CAISSIER)
   peut créer une vente (`route.ts:73`).
2. **Validation Zod** du corps via `createVenteSchema` (`route.ts:78`) ; sinon `400` avec
   `details` (flatten Zod).
3. **Session ouverte** : `comptoirSession` doit exister et avoir `statut === "OUVERTE"`,
   sinon `422` (`route.ts:89`).
4. **Caisse active** : on résout la **première** caisse `active: true` ; aucune → `422`
   (`route.ts:98`).
5. **Taxes actives** : lecture des `Taxe` `active: true` du `parametresId: "default"`,
   triées par `ordre` (`route.ts:105`).
6. **Boucle de re-tentative P2002** (max 3) autour de la transaction, pour absorber une
   collision concurrente sur le numéro unique (`route.ts:113`).
7. **Transaction atomique** `prisma.$transaction` (`route.ts:116`) :
   - relecture de chaque produit ; rejet si introuvable / inactif (`422`) ou
     `stockActuel < quantite` (`422`) (`route.ts:118`) ;
   - calcul des **sous-totaux de ligne** en `Decimal` (voir §5) ;
   - calcul **remise / base / taxes / total** ; rejet si `total <= 0` (`422`, `route.ts:170`) ;
   - vérification que la somme des paiements **couvre** le total ; sinon `422`
     « Paiement insuffisant » (`route.ts:179`) ;
   - génération du **numéro** via compteur `Sequence` (upsert + increment, voir §6) ;
   - `tx.vente.create` avec lignes et paiements imbriqués (`route.ts:197`) ;
   - **décrément de stock conditionnel atomique** `updateMany WHERE stockActuel >= quantite`
     (garde anti-stock-négatif sous concurrence) ; `count === 0` → `422` (`route.ts:232`) ;
   - création d'un `MouvementStock` `SORTIE` par ligne, avec `quantiteAvant/Apres` et
     `motif = "Vente <numero>"` (`route.ts:240`) ;
   - création d'un `MouvementCaisse` `VENTE` **par paiement**, montant **plafonné à la part
     restante du total** (jamais le sur-paiement / monnaie rendue) via `createMovementInTx`
     (`route.ts:257`).
8. **Journal d'activité** : `logActivity(ACTIONS.SALE_COMPLETED, ...)` avec métadonnées
   (numéro, total, remise, TVA, paiements, lignes), IP & user-agent (`route.ts:279`).
9. Réponse `201 { data: vente }`.

Côté UI (`src/components/comptoir/POSInterface.tsx`) :

- Le panier est un store **Zustand** (`useCartStore`) ; le `PaymentModal`
  (`POSInterface.tsx:487`) construit le payload et appelle `POST /api/ventes`.
- En **espèces**, le montant envoyé est le **montant reçu** (`montantRecu`), pas le total — le
  serveur recale la part caisse réelle (`POSInterface.tsx:517`).
- Après succès en espèces : **ouverture tiroir-caisse** en fire-and-forget
  (`POSInterface.tsx:561`) ; une défaillance périphérique **ne rollback pas** la vente.

---

## 3. Modèle de données

(`prisma/schema.prisma`)

### Vente (`schema.prisma:272`)

| Champ | Type | Notes |
|---|---|---|
| `id` | `String` cuid | PK |
| `numero` | `String` **@unique** | `VTE-YYYY-NNNNN` (§6) |
| `dateVente` | `DateTime` | défaut `now()` |
| `sousTotal` | `Decimal(10,2)` | Σ sous-totaux de ligne (après remise de ligne) |
| `remise` | `Decimal(10,2)` | remise globale en **montant** (défaut 0) |
| `tva` | `Decimal(10,2)` | **TVA totale de la vente** (source de vérité, défaut 0) |
| `taxesDetail` | `Json?` | `[{ nom, taux, montant }]` par taxe active |
| `total` | `Decimal(10,2)` | `sousTotal - remise + tva` |
| `statut` | `StatutVente` | `VALIDEE` (défaut), `ANNULEE`, `REMBOURSEE` |
| `nomClient` | `String?` | optionnel |
| `notesCaissier` | `String?` | optionnel |
| `sessionId` | FK | `ComptoirSession` |
| `userId` | FK → `caissier` | auteur de la vente |

Relations : `lignes` (`LigneVente[]`), `paiements` (`Paiement[]`), `mouvementsStock`,
`mouvementsCaisse`.

### LigneVente (`schema.prisma:304`)

| Champ | Type | Notes |
|---|---|---|
| `quantite` | `Int` | > 0 |
| `prixUnitaire` | `Decimal(10,2)` | prix au moment de la vente |
| `remise` | `Decimal(10,2)` | remise **de ligne** en % (défaut 0) |
| `tva` | `Decimal(10,2)` | **toujours 0** — modèle taxe globale (cf. commentaire schéma) |
| `sousTotal` | `Decimal(10,2)` | `prixUnitaire × quantite × (1 − remise/100)` |
| `venteId` | FK (`onDelete: Cascade`) | |
| `produitId` | FK | |

### Paiement (`schema.prisma:333`)

| Champ | Type | Notes |
|---|---|---|
| `mode` | `String` | code mode (`ESPECES`, mobile money…) — **non enum** |
| `montant` | `Decimal(10,2)` | montant **encaissé** (peut inclure le sur-paiement espèces) |
| `reference` | `String?` | réf. transaction (mobile money / carte) |
| `venteId` | FK (`onDelete: Cascade`) | |

### Sequence (`schema.prisma:325`)

Compteur transactionnel : `id` (ex. `VTE-2026`), `valeur` (`Int`, défaut 0), `updatedAt`.
Incrément atomique → numéros uniques et monotones sous concurrence, **sans plafond annuel**.

### Modèles liés

- `MouvementCaisse` (`schema.prisma:204`) : `type` (`TypeMouvementCaisse`), `mode`,
  `montant` `Decimal(10,2)`, `caisseId`, `sessionId?`, `venteId?`, `auteurId`.
- `ComptoirSession` (`schema.prisma:126`), `Caisse` (`schema.prisma:113`),
  `Taxe` (`schema.prisma:381`), `ModePaiementConfig` (`schema.prisma:366`).

---

## 4. Modes de paiement

- Le `mode` est un **`String` libre** côté `Paiement` et `MouvementCaisse` (pas d'enum
  Prisma) ; les modes disponibles sont configurables via `ModePaiementConfig`
  (`code`, `label`, `active`, `ordre` — `schema.prisma:366`).
- Validation : `paiementSchema` exige `mode` non vide, `montant > 0`, `reference` optionnelle
  (`src/lib/validations/vente.ts:11`). Une vente accepte **1 à 2** paiements
  (`createVenteSchema`, `vente.ts:23` : `.min(1).max(2)`) → paiement mixte possible.
- UI : modes par défaut `ESPECES` (« Cash ») et un mobile money si non fournis par la config
  (`POSInterface.tsx:19`). Le code `ESPECES` est traité spécialement :
  - saisie du **montant reçu** + calcul de la **monnaie à rendre**
    (`monnaieARendre`, `POSInterface.tsx:496`) ;
  - les autres modes saisissent une **référence** (`POSInterface.tsx:750`) et envoient
    `montant = totalAPayer`.
- Côté serveur, le **mouvement de caisse `VENTE`** par paiement enregistre la **part du total**
  couverte (plafonnée), pas le montant reçu : le sur-paiement espèces (monnaie rendue) n'entre
  pas au ledger (`route.ts:255`).

---

## 5. Calcul totaux / remise / TVA (Decimal, taxe globale)

Tous les calculs serveur utilisent `Prisma.Decimal` de bout en bout (pas d'arithmétique
`number` intermédiaire — « Lot F ») :

1. **Sous-total de ligne** (`route.ts:139`) :
   `prixUnitaire × quantite × (1 − remise_ligne/100)`, en `Decimal`.
2. **Sous-total vente** = Σ des sous-totaux de ligne (`route.ts:142`).
3. **Base taxable** = `sousTotal − remise_globale` (`route.ts:154`).
4. **Taxes** : si `base > 0`, pour chaque `Taxe` active : `montant = round(base × taux/100)`,
   poussé dans `taxesDetail`, cumulé dans `tva` (`route.ts:159`). Modèle **taxe globale** : la
   TVA est portée par **`Vente.tva` + `Vente.taxesDetail`** ; **`LigneVente.tva = 0`** toujours
   (`route.ts:147`, commentaire `schema.prisma:309`).
5. **Total** = `sousTotal − remise + tva` (`route.ts:167`). Rejet si `total <= 0` (`422`).
6. **Couverture paiement** : Σ paiements ≥ total, sinon `422` (`route.ts:179`).

Remise : au niveau **vente**, la remise est transmise en **montant** (`remise`,
`createVenteSchema` `vente.ts:26` : `min(0)`). Au niveau **ligne**, c'est un **pourcentage**
0–100 (`ligneVenteSchema` `vente.ts:8`). Côté store, la remise globale peut être saisie en
`pourcentage` ou `fixe`, bornée puis convertie en montant avant envoi
(`cartStore.ts:109`, `montantRemise` `cartStore.ts:130`).

> Note cohérence : le store Zustand recalcule les mêmes formules en `number` arrondi
> (`Math.round`) pour l'affichage (`cartStore.ts:122`), mais la **valeur faisant foi** est
> celle recalculée côté serveur en `Decimal`.

---

## 6. Numérotation (Sequence, format, atomicité)

- **Format** : `VTE-<annee>-<NNNNN>`, `NNNNN` = séquence sur **minimum 5 chiffres**
  (`padStart(5, "0")`), **sans plafond** au-delà de 99 999
  (`genererNumeroVente`, `route.ts:12`).
- **Atomicité** : dans la transaction, `tx.sequence.upsert` sur la clé `VTE-<annee>`
  (`create valeur:1` / `update valeur:{ increment: 1 }`) délivre une valeur **unique et
  monotone** par année, même sous concurrence (`route.ts:188`).
- **Garde de course** : la contrainte `@unique` sur `Vente.numero` (`schema.prisma:274`)
  protège en dernier ressort ; une collision `P2002` déclenche jusqu'à **3 re-tentatives**
  (`MAX_P2002_RETRIES`, `route.ts:8`) ; échec final → `409`
  « Conflit de numéro de vente, veuillez réessayer » (`route.ts:319`).
- Compteur séparé par préfixe/année → la **séquence redémarre** chaque année.

### Évolution Desktop (multi-postes) — prévu, non implémenté

L'architecture desktop prévoit une numérotation **préfixée par poste** :
`VTE-<codePoste>-YYYY-NNNNN`, afin de garantir l'unicité à l'échelle de l'organisation lors de
l'agrégation de plusieurs magasins/caisses dans le cloud. Voir
`docs/architecture-desktop/00-ROADMAP-IMPLEMENTATION.md:111` (tâche **F1.2**) et
`docs/architecture-desktop/05-synchronisation-cloud.md:47`. L'implémentation **actuelle** reste
une séquence **globale sans préfixe poste** (jalon décrit comme tel,
`00-ROADMAP-IMPLEMENTATION.md:53`).

---

## 7. Annulation (RETOUR stock + REMBOURSEMENT caisse)

`POST /api/ventes/[id]/annuler` (`src/app/api/ventes/[id]/annuler/route.ts:6`).

**Conditions** :

- Rôle **`ADMIN` ou `MANAGER`** requis — `requireRole("ADMIN", "MANAGER")` (`annuler:10`) ;
  CAISSIER interdit.
- Vente existante, sinon `404` (`annuler:21`).
- `statut === "VALIDEE"` requis, sinon `422` « Seule une vente validée peut être annulée »
  (`annuler:25`).
- Caisse active présente, sinon `422` (`annuler:33`).
- **Session de la vente toujours `OUVERTE`**, sinon `422` « Impossible d'annuler une vente dont
  la session est fermée » (`annuler:40`).

**Effets** (transaction atomique, `annuler:52`) :

1. `Vente.statut → ANNULEE` (`annuler:54`).
2. Pour chaque ligne : `produit.stockActuel += quantite` + `MouvementStock` **`RETOUR`** avec
   `quantiteAvant/Apres` et `motif = "Annulation vente <numero>"` (`annuler:65`).
3. Pour chaque paiement : `MouvementCaisse` **`REMBOURSEMENT`** de montant **négatif**, plafonné
   à la part restante du total (même logique de cap que la création), via `createMovementInTx`
   (`annuler:90`).
4. `logActivity(ACTIONS.SALE_CANCELLED, ...)` avec métadonnées (`annuler:111`).

Réponse `200 { data: vente }`.

---

## 8. Endpoints

| Méthode | Chemin | Permission | Validation | Comportement |
|---|---|---|---|---|
| `GET` | `/api/ventes` | Authentifié. **CAISSIER** = ses ventes seulement ; **ADMIN/MANAGER** = toutes (+ filtres `userId`, `dateFrom`, `dateTo`) | query : `page`, `pageSize` (max 100) | Liste paginée `{ data, total, page, pageSize }` (`ventes/route.ts:16`) |
| `POST` | `/api/ventes` | Authentifié (CAISSIER inclus) | `createVenteSchema` | Création atomique vente+lignes+paiements+stock+caisse → `201` (`ventes/route.ts:72`) |
| `GET` | `/api/ventes/[id]` | Authentifié ; **IDOR** : CAISSIER ne voit que ses ventes (sinon `403`) | — | Détail (lignes, paiements, caissier, session) ; `404` si absent (`ventes/[id]/route.ts:4`) |
| `POST` | `/api/ventes/[id]/annuler` | **ADMIN / MANAGER** | conditions §7 | Annulation + RETOUR stock + REMBOURSEMENT caisse → `200` (`ventes/[id]/annuler/route.ts:6`) |

Codes d'erreur récurrents : `400` (Zod), `401` (non authentifié), `403` (IDOR),
`404` (introuvable), `422` (règle métier : session fermée, stock insuffisant, produit
inactif, paiement insuffisant, total ≤ 0, pas de caisse active), `409` (collision numéro après
re-tentatives), `500` (erreur serveur).

Conventions de réponse : succès `{ data }` ; erreur `{ error, details? }`.

---

## 9. Tests existants (`src/__tests__/ventes/`)

| Fichier | Couvre |
|---|---|
| `api.test.ts` | `GET`/`POST /api/ventes` & `GET /[id]` : auth 401, restriction CAISSIER, filtres ADMIN, pagination, création transactionnelle, stock insuffisant (422), Zod 400 (sans lignes / sans paiements), session non ouverte, 404 détail, 500 Prisma (26 cas) |
| `sale-creation.test.ts` | Détail création : session non ouverte / introuvable, succès transaction, **décrément conditionnel `updateMany`**, `MouvementStock SORTIE` (quantiteAvant/Apres), `createMovementInTx` avec **total et non sur-paiement**, stock insuffisant, produit inactif, paiement insuffisant, **taxes depuis config + `taxesDetail`**, absence de taxes, taxes sur base après remise, 500 (13 cas) |
| `annulation-bugs.test.ts` | **P0-002** cap du remboursement au total ; **P0-003** annulation bloquée si session `VALIDEE`/`FERMEE`, autorisée si `OUVERTE` ; **P0-005** 422 sans caisse active (5 cas) |
| `race-condition-p2002.test.ts` | **P0-001** : re-tentative sur `P2002` puis succès ; erreur claire après épuisement des re-tentatives (2 cas) |
| `numerotation-sequence.test.ts` | **Lot E** : usage du compteur `Sequence` (upsert increment) ; pas de plafond à 99 999 (2 cas) |
| `remise-borne.test.ts` | **P1-001** : 422 si remise > sous-total (total négatif) ; OK si total reste positif (2 cas) |
| `decimal-precision.test.ts` | **Lot F** : sous-total de ligne exact (pas d'artefact de flottant) (1 cas) |

---

## 10. Composants & store associés

- `src/store/cartStore.ts` — store Zustand du panier (persistance `sessionStorage`, clé
  `aerispay-cart`) : items, remise globale (`pourcentage`/`fixe`), taxes, et calculs dérivés
  (`sousTotal`, `montantRemise`, `detailTaxes`, `montantTaxes`, `total`).
- `src/components/comptoir/POSInterface.tsx` — grille produits, panier, `PaymentModal`
  (modes, montant reçu, monnaie à rendre, référence), appel `POST /api/ventes`, ouverture
  tiroir en espèces.
- `src/components/comptoir/CancelButton.tsx`, `TicketActions.tsx`, `SessionManager.tsx`,
  `VenteFilterDate.tsx` — actions annexes (annulation, ticket/impression, gestion session,
  filtre date).
