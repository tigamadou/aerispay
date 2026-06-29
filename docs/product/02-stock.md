# Module Gestion de Stock — Documentation produit

> Source de vérité : le **code réel** sous `web/app/src/`.
> Ce document décrit l'implémentation telle qu'elle existe au 26/06/2026 (branche `feat/audit_refacto`).
> Les chemins de fichiers sont relatifs à la racine du dépôt ; les annotations `fichier:ligne` pointent le code exact.

---

## 1. Objectif

Le module de gestion de stock couvre le **catalogue produits**, leur **classement par catégories**, le **suivi des mouvements de stock** (entrées, sorties, ajustements, pertes) et les **alertes de rupture**. Il garantit une cohérence stricte du stock physique, en particulier l'absence de **survente** (stock négatif) y compris sous accès concurrent (plusieurs caisses / plusieurs caissiers).

Points clés de l'implémentation :

- Le stock courant est porté par un unique champ entier `Produit.stockActuel` (pas de stock par lot ni par emplacement).
- Toute variation de stock passe soit par un **mouvement de stock** (`/api/stock/mouvements`), soit par une **vente** (`/api/ventes`), et est tracée dans `MouvementStock`.
- Les écritures critiques utilisent un **décrément conditionnel atomique** + une **contrainte CHECK** en base pour interdire le stock négatif.
- Les opérations de modification (création produit/catégorie, mouvements) sont réservées aux rôles **ADMIN** et **MANAGER** ; la lecture est ouverte à tout utilisateur authentifié.

---

## 2. Modèle de données

Source : `web/app/prisma/schema.prisma`.

### 2.1 `Categorie` (`schema.prisma:43`)

| Champ | Type | Contraintes / défaut |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `nom` | `String` | (unicité applicative, voir §4.2 — pas de contrainte DB) |
| `description` | `String?` | optionnel |
| `couleur` | `String?` | optionnel, format `#RRGGBB` côté validation |
| `createdAt` | `DateTime` | `@default(now())` |
| `produits` | `Produit[]` | relation inverse |

Table : `categories`.

### 2.2 `Produit` (`schema.prisma:55`)

| Champ | Type | Contraintes / défaut |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `reference` | `String` | `@unique` — auto-générée si absente (`genererReference()`) |
| `codeBarres` | `String?` | `@unique` — optionnel |
| `nom` | `String` | — |
| `description` | `String?` | optionnel |
| `image` | `String?` | URL optionnelle |
| `prixAchat` | `Decimal` | `@db.Decimal(10,2)` |
| `prixVente` | `Decimal` | `@db.Decimal(10,2)` |
| `tva` | `Decimal` | `@default(0) @db.Decimal(5,2)` — **catalogue / informatif uniquement** ; la TVA de vente vient de la config `Taxe` globale, pas de ce champ (cf. `schema.prisma:64-68`) |
| `unite` | `String` | `@default("unité")` |
| `stockActuel` | `Int` | `@default(0)` — **CHECK `>= 0`** en base (voir §6) |
| `stockMinimum` | `Int` | `@default(5)` — seuil de rupture |
| `stockMaximum` | `Int?` | optionnel |
| `actif` | `Boolean` | `@default(true)` — désactivation = soft-delete |
| `createdAt` / `updatedAt` | `DateTime` | `@default(now())` / `@updatedAt` |
| `categorieId` | `String` | FK obligatoire vers `Categorie` |
| `mouvements` | `MouvementStock[]` | relation inverse |
| `lignesVente` | `LigneVente[]` | relation inverse |

Table : `produits`. Sérialisation API : `prixAchat`, `prixVente`, `tva` sont convertis de `Decimal` vers `number` (`serializeProduit`, `api/produits/route.ts:14`).

### 2.3 `MouvementStock` (`schema.prisma:85`)

| Champ | Type | Rôle |
|---|---|---|
| `id` | `String` | `@id @default(cuid())` |
| `type` | `TypeMouvement` | enum (voir §3) |
| `quantite` | `Int` | quantité du mouvement (toujours positive en entrée) |
| `quantiteAvant` | `Int` | stock avant application |
| `quantiteApres` | `Int` | stock après application |
| `motif` | `String?` | obligatoire pour AJUSTEMENT/PERTE (validation) |
| `reference` | `String?` | référence libre (ex. bon de livraison) |
| `createdAt` | `DateTime` | `@default(now())` |
| `produitId` | `String` | FK vers `Produit` |
| `venteId` | `String?` | FK optionnelle — renseignée pour les SORTIE issues d'une vente |

Table : `mouvements_stock`. Un mouvement est **immuable** (pas d'endpoint d'édition/suppression).

### 2.4 Enum `TypeMouvement` (`schema.prisma:103`)

`ENTREE`, `SORTIE`, `AJUSTEMENT`, `RETOUR`, `PERTE`.

> **Écart code/données à noter :** l'enum DB contient `RETOUR`, mais l'API `/api/stock/mouvements` **ne l'accepte pas** : le schéma Zild (`createMouvementSchema`) n'autorise que `ENTREE | SORTIE | AJUSTEMENT | PERTE` (`lib/validations/mouvement.ts:6`), et le `switch` de la route renvoie « Type de mouvement invalide » (400) pour tout autre cas (`api/stock/mouvements/route.ts:141`). `RETOUR` n'est donc pas exploitable via cette route aujourd'hui.

---

## 3. Types de mouvements et effet sur le stock

Logique implémentée dans `web/app/src/app/api/stock/mouvements/route.ts` (POST, transaction `prisma.$transaction`).

| Type | Effet sur `stockActuel` | Mécanisme | Motif requis ? |
|---|---|---|---|
| `ENTREE` | `+ quantite` | `update { increment }` (`route.ts:90`) | Non |
| `SORTIE` | `- quantite` | **décrément conditionnel atomique** `updateMany WHERE stockActuel >= quantite` ; rejet **422** si aucune ligne affectée (`route.ts:97-112`) | Non |
| `PERTE` | `- quantite` | identique à SORTIE (même branche, décrément conditionnel) (`route.ts:97-112`) | **Oui** (min. 4 car.) |
| `AJUSTEMENT` | **= quantite** (valeur absolue) | `SELECT ... FOR UPDATE` puis `update` ; `quantiteAvant` = valeur verrouillée (`route.ts:113-140`) | **Oui** (min. 4 car.) |
| `RETOUR` | — | **non géré par l'API** (rejeté par Zod, voir §2.4) | — |

Notes :

- Pour **SORTIE / PERTE**, `quantite` est une quantité à retrancher ; un stock insuffisant produit une erreur 422 « Stock insuffisant (disponible : X, demandé : Y) ».
- Pour **AJUSTEMENT**, `quantite` est la **nouvelle valeur absolue** du stock (et non un delta). Le verrou de ligne `FOR UPDATE` évite le *lost update* entre deux ajustements concurrents.
- Chaque mouvement crée une ligne `MouvementStock` avec `quantiteAvant`/`quantiteApres` et journalise via `logActivity(STOCK_MOVEMENT_CREATED)` (`route.ts:161`).
- Les **ventes** créent automatiquement un mouvement `SORTIE` par ligne, avec `venteId` renseigné et `motif = "Vente <numero>"` (`api/ventes/route.ts:240`).

---

## 4. Endpoints

Authentification : toutes les routes passent par `requireAuth()` / `requireRole()` (`lib/permissions`). Réponses succès : `{ data, ... }` ; erreurs : `{ error, details? }`.

### 4.1 Produits — `web/app/src/app/api/produits/`

| Méthode / chemin | Permission | Validation | Description |
|---|---|---|---|
| `GET /api/produits` | Authentifié | query params | Liste paginée + filtres (`route.ts:23`) |
| `POST /api/produits` | **ADMIN, MANAGER** | `createProductSchema` | Création produit (`route.ts:115`) |
| `GET /api/produits/[id]` | Authentifié | — | Détail + 10 derniers mouvements (`[id]/route.ts:15`) |
| `PUT /api/produits/[id]` | **ADMIN, MANAGER** | `updateProductSchema` | Mise à jour partielle (`[id]/route.ts:47`) |
| `DELETE /api/produits/[id]` | **ADMIN, MANAGER** | — | **Soft-delete** : `actif = false` (`[id]/route.ts:136`) |

`GET /api/produits` — paramètres : `page` (≥1), `pageSize` (1–100, défaut 20), `categorieId`, `actif` (`true`/`false`), `recherche` (sur `nom`, `reference`, `codeBarres`), `tri` (`nom`|`stock`|`prix`|`createdAt`), `ordre` (`asc`|`desc`), `statut`. Le filtre `statut` est appliqué **en mémoire** après requête (comparaison colonne-à-colonne non supportée par Prisma) :

| `statut` | Condition (`route.ts:92-106`) |
|---|---|
| `rupture` | `0 < stockActuel <= stockMinimum` |
| `epuise` | `stockActuel === 0` |
| `alerte` | `stockMinimum < stockActuel <= 2 × stockMinimum` |
| `normal` | `stockActuel > 2 × stockMinimum` |

Contrôles `POST`/`PUT` produit :
- `createProductSchema` exige `prixVente > prixAchat` (`refine`, `lib/validations/produit.ts:18`) ; même règle recalculée au `PUT` avec les valeurs existantes (`[id]/route.ts:74`).
- Unicité `codeBarres` vérifiée (409 si conflit) ; existence de la catégorie vérifiée (400 sinon).
- `reference` auto-générée si non fournie (`genererReference()`).
- Journalisation : `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DEACTIVATED`.

### 4.2 Catégories — `web/app/src/app/api/categories/`

| Méthode / chemin | Permission | Validation | Description |
|---|---|---|---|
| `GET /api/categories` | Authentifié | — | Liste + `_count.produits`, triée par nom (`route.ts:6`) |
| `POST /api/categories` | **ADMIN, MANAGER** | `createCategorieSchema` | Création, unicité nom (409) (`route.ts:23`) |
| `PUT /api/categories/[id]` | **ADMIN, MANAGER** | `updateCategorieSchema` | Mise à jour, unicité nom (`[id]/route.ts:6`) |
| `DELETE /api/categories/[id]` | **ADMIN, MANAGER** | — | Suppression **bloquée (422)** si produits rattachés (`[id]/route.ts:75`) |

Validation catégorie (`lib/validations/categorie.ts`) : `nom` 2–100 car. ; `couleur` au format `#RRGGBB` (regex). Journalisation : `CATEGORY_CREATED/UPDATED/DELETED`.

### 4.3 Mouvements de stock — `web/app/src/app/api/stock/mouvements/route.ts`

| Méthode / chemin | Permission | Validation | Description |
|---|---|---|---|
| `GET /api/stock/mouvements` | **ADMIN, MANAGER** | query params | Liste paginée, filtres `produitId`, `type`, `dateDebut`, `dateFin` (`route.ts:16`) |
| `POST /api/stock/mouvements` | **ADMIN, MANAGER** | `createMouvementSchema` | Crée un mouvement + applique l'effet stock en transaction (`route.ts:61`) |

`createMouvementSchema` (`lib/validations/mouvement.ts`) :
- `produitId` requis ; `type ∈ {ENTREE, SORTIE, AJUSTEMENT, PERTE}` ; `quantite` entier **strictement positif** ; `motif`, `reference` optionnels.
- `refine` : `motif` **obligatoire** (> 3 caractères) si `type` vaut `AJUSTEMENT` ou `PERTE`.

### 4.4 Alertes — `web/app/src/app/api/stock/alertes/route.ts`

| Méthode / chemin | Permission | Description |
|---|---|---|
| `GET /api/stock/alertes` | Authentifié | Produits actifs en alerte/rupture (`route.ts:13`) |

---

## 5. Alertes de rupture

Implémentation : `GET /api/stock/alertes` (`api/stock/alertes/route.ts:26`).

- Récupère les produits **actifs** (`actif: true`), triés par `stockActuel` croissant.
- Filtre en mémoire : **`stockActuel <= 2 × stockMinimum`** (couvre donc à la fois la zone d'alerte et la rupture/épuisement).
- Le seuil de référence est `Produit.stockMinimum` (défaut 5).

Le composant `web/app/src/components/stock/StockAlertBadge.tsx` affiche l'état de stock (rupture / alerte / normal), cohérent avec les seuils du `GET /api/produits?statut=...`.

> Cohérence des seuils : `rupture` = `0 < stock <= stockMinimum`, `epuise` = `stock === 0`, `alerte` = `stockMinimum < stock <= 2×stockMinimum`. L'endpoint `/alertes` agrège tout ce qui est `<= 2×stockMinimum`.

---

## 6. Règle anti-survente (atomicité & CHECK DB)

Objectif : **aucun stock négatif**, y compris sous accès concurrent (plusieurs caisses/caissiers tapant en même temps). Défense en profondeur à trois niveaux.

1. **Décrément conditionnel atomique (applicatif).** Toute sortie de stock s'exécute via un `UPDATE ... WHERE stockActuel >= quantite` (`updateMany` Prisma) à l'intérieur d'une transaction. Si aucune ligne n'est affectée (`count === 0`), l'opération est rejetée (422) et la transaction annulée. Cela rend le test-et-décrément **atomique** (pas de fenêtre lecture→écriture exploitable).
   - Ventes : `api/ventes/route.ts:232-238`.
   - Mouvements SORTIE/PERTE : `api/stock/mouvements/route.ts:100-109`.

2. **Verrou de ligne pour les ajustements.** L'`AJUSTEMENT` écrit une valeur absolue ; il prend un verrou `SELECT stockActuel FROM produits WHERE id = ? FOR UPDATE` avant lecture/écriture pour empêcher le *lost update* entre deux ajustements concurrents (`api/stock/mouvements/route.ts:116-124`).

3. **Contrainte CHECK en base (dernier rempart).** Migration `prisma/migrations/20260623180000_lot_g_fond_ouverture_levee/migration.sql:25` :
   ```sql
   ALTER TABLE `produits`
     ADD CONSTRAINT `chk_produits_stock_non_negatif` CHECK (`stockActuel` >= 0);
   ```
   Même si un chemin de code oubliait la garde applicative, la base refuserait tout `stockActuel < 0`.

À noter : la vente effectue d'abord une **pré-vérification** non bloquante (`p.stockActuel < l.quantite` → 422, `api/ventes/route.ts:124`) à titre de message d'erreur clair, mais la **garantie** réelle vient du décrément conditionnel (étape 1). Les mouvements de stock liés à une vente sont créés dans la **même transaction** que la vente.

---

## 7. Cohérence multi-caisses (déploiement desktop)

Dans le déploiement cible « desktop / nœud magasin », **une seule base de données** est hébergée au nœud du point de vente ; toutes les caisses du magasin écrivent sur cette base unique. Le stock est donc **cohérent par magasin** : le décrément conditionnel atomique (§6) et la contrainte CHECK s'appliquent sur la ligne `produits` partagée, ce qui **empêche toute survente entre caisses** d'un même magasin (deux caissiers ne peuvent pas vendre le même dernier exemplaire). La synchronisation **inter-magasins** relève d'un autre périmètre (cf. `../../ARCHITECTURE_MVP.md` §1) et n'est pas couverte par ce module.

---

## 8. Composants UI — `web/app/src/components/stock/`

| Composant | Rôle |
|---|---|
| `ProductsGrid.tsx` | Grille/liste des produits avec filtres et statuts |
| `ProductForm.tsx` | Formulaire création/édition produit (React Hook Form + Zod) |
| `CategoryManager.tsx` | Gestion des catégories (CRUD) |
| `MovementForm.tsx` | Saisie d'un mouvement de stock (type, quantité, motif) |
| `MovementTable.tsx` | Historique des mouvements |
| `StockAlertBadge.tsx` | Badge d'état de stock (rupture / alerte / normal) |

---

## 9. Tests existants — `web/app/src/__tests__/stock/`

| Fichier | Couverture principale |
|---|---|
| `produits-api.test.ts` | CRUD produits : auth/rôles, pagination, filtres (`rupture`/`epuise`/`normal`/`alerte`), tri, recherche, `prixVente > prixAchat`, unicité code-barres, soft-delete, erreurs 500 |
| `categories-api.test.ts` | CRUD catégories : rôles, unicité nom (409), blocage suppression si produits rattachés (422), erreurs |
| `mouvements-api.test.ts` | GET (auth/rôles, filtres produit/type/date) ; POST (ENTREE incrémente, SORTIE rejetée si stock insuffisant, AJUSTEMENT valeur absolue, PERTE avec motif, motif obligatoire AJUSTEMENT/PERTE) ; **atomicité Lot B** : décrément conditionnel `updateMany`, verrou `FOR UPDATE` pour AJUSTEMENT |
| `oversell-race.test.ts` | Anti-survente côté `/api/ventes` : rejet 422 si décrément conditionnel n'affecte aucune ligne ; décrément via `updateMany` (et non `update` aveugle) |
| `ajustement-race.test.ts` | Concurrence sur AJUSTEMENT : verrou de ligne, rejet sans ligne affectée |
| `alertes-api.test.ts` | `GET /api/stock/alertes` : auth, produits en stock bas, tableau vide si stock normal, erreur 500 |

> Le code de référence pour l'anti-survente vente est aussi couvert par `web/app/src/__tests__/ventes/race-condition-p2002.test.ts` (numérotation) et la logique de `api/ventes/route.ts`.

---

*Document dérivé du code — toute divergence future doit être réconciliée avec `web/app/src/`.*
