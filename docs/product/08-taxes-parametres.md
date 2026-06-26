# 08 — Taxes, Paramètres commerce & Upload

> Documentation produit dérivée du **code réel** (source de vérité = le code, pas une spec).
> Périmètre : configuration des **taxes** appliquées aux ventes, **paramètres** de la structure
> commerciale (affichés sur les tickets) et **upload** d'images (logo, photos produits).

---

## 1. Objectif

Ce module regroupe les **données de référence commerciale** de l'instance AerisPay :

- **Taxes** : liste de taxes configurables (TVA, AIB, etc.) appliquées globalement à chaque vente.
- **Paramètres commerce** : identité de la structure (nom, adresse, RCCM, NIF, logo…) imprimée
  sur les tickets de caisse (PDF et thermique).
- **Upload** : endpoint générique de téléversement d'images vers un stockage objet (S3/MinIO),
  utilisé pour le logo de la structure et les photos de produits.

Tous ces objets sont rattachés à un singleton `Parametres` d'identifiant fixe **`"default"`**
(instance mono-structure côté magasin).

---

## 2. Taxes

### 2.1 Modèle de données

Modèle Prisma `Taxe` — `web/app/prisma/schema.prisma:381`

| Champ          | Type             | Détail                                                        |
| -------------- | ---------------- | ------------------------------------------------------------- |
| `id`           | String (cuid)    | Identifiant                                                   |
| `nom`          | String           | Libellé affiché (ex. « TVA », « AIB »)                        |
| `taux`         | Decimal(5,2)     | Taux en pourcentage (0 à 100)                                 |
| `active`       | Boolean          | `true` = appliquée aux ventes (défaut `true`)                 |
| `ordre`        | Int              | Ordre d'affichage / d'application (défaut `0`)                |
| `createdAt`    | DateTime         | Horodatage de création                                       |
| `updatedAt`    | DateTime         | Horodatage de mise à jour                                     |
| `parametresId` | String           | FK vers `Parametres`, défaut `"default"`                      |

Table SQL : `taxes`. Relation : `Parametres.taxes Taxe[]` (`schema.prisma:360`).

### 2.2 Validation

`web/app/src/lib/validations/taxe.ts`

- `createTaxeSchema` (`taxe.ts:3`) : `nom` (1 à 50 car., obligatoire), `taux` (number, `min 0` / `max 100`),
  `active` (boolean, défaut `true`), `ordre` (entier `>= 0`, défaut `0`).
- `updateTaxeSchema` (`taxe.ts:10`) : version `.partial()` du schéma de création (tous champs optionnels).

### 2.3 CRUD (API)

- `web/app/src/app/api/taxes/route.ts` — `GET` (liste) / `POST` (création).
- `web/app/src/app/api/taxes/[id]/route.ts` — `PUT` (mise à jour) / `DELETE` (suppression).

Caractéristiques :

- `GET` filtre sur `parametresId: "default"`, trié par `ordre asc` (`route.ts:11`).
- `POST` force `parametresId: "default"` (`route.ts:41`).
- Les écritures journalisent une activité : `TAXE_CREATED`, `TAXE_UPDATED`, `TAXE_DELETED`
  (via `logActivity`, avec IP et User-Agent — `route.ts:45`, `[id]/route.ts:30`/`:58`).
- Permissions : lecture pour tout utilisateur authentifié ; création/modification/suppression
  réservées à **ADMIN** (`requireRole("ADMIN")`).

### 2.4 Application aux ventes — modèle « taxe globale »

Le calcul de taxe est **global à la vente**, pas par-ligne. Implémentation dans
`web/app/src/app/api/ventes/route.ts`.

1. À la création d'une vente, on charge les taxes **actives** triées par `ordre`
   (`ventes/route.ts:104`).
2. La **base imposable** = `sousTotal - remise` (`ventes/route.ts:154`).
3. Pour chaque taxe active, le montant = `base × taux/100`, arrondi (`Decimal.round()`),
   poussé dans un tableau `taxesDetail` (`ventes/route.ts:160`).
4. `totalTva` = somme des montants de taxes ; `total = sousTotal - remise + totalTva`
   (`ventes/route.ts:167`).

**Source de vérité = la vente** : les montants sont figés à l'instant de la vente dans
`Vente.tva` (total des taxes) et `Vente.taxesDetail` (JSON `{ nom, taux, montant }[]`) —
`schema.prisma:278-279`. Modifier ou supprimer une taxe **après** la vente n'altère donc pas
les ventes passées.

> **Pas de taxation par-ligne.** Le champ `LigneVente.tva` reste à `0`
> (`schema.prisma:309-311`), de même que `tva: 0` à la construction des lignes
> (`ventes/route.ts:147`). Le champ catalogue `Produit.tva` est **informatif uniquement** et
> n'entre PAS dans le calcul de la taxe de vente (`schema.prisma:65-68`).

### 2.5 Intégration ticket / PDF

Le générateur PDF (`web/app/src/lib/receipt/pdf-generator.tsx`) consomme `sale.taxesDetail` :

- si `taxesDetail` est non vide, chaque taxe est affichée ligne à ligne (`pdf-generator.tsx:260`) ;
- sinon, repli sur `sale.tva` global si `> 0` (`pdf-generator.tsx:269`).

La route PDF (`web/app/src/app/api/tickets/[id]/pdf/route.ts:49`) reconstruit `taxesDetail`
depuis le JSON stocké sur la vente avant de générer le document.

### 2.6 Page d'administration

`web/app/src/app/(dashboard)/taxes/page.tsx` — accès réservé via
`hasPermission(role, "parametres:manage")` (ADMIN uniquement, voir §5), sinon redirection.
La page charge les taxes (`parametresId: "default"`, tri `ordre asc`) et rend le composant
client `TaxesSection`.

---

## 3. Paramètres commerce

### 3.1 Modèle de données

Modèle Prisma `Parametres` — `web/app/prisma/schema.prisma:348` (singleton, table `parametres`).

| Champ         | Type              | Détail                                            |
| ------------- | ----------------- | ------------------------------------------------- |
| `id`          | String            | Toujours `"default"` (défaut)                     |
| `nomCommerce` | String            | Nom du commerce                                   |
| `adresse`     | String            | Adresse postale                                   |
| `telephone`   | String            | Téléphone                                         |
| `email`       | String            | Email                                             |
| `rccm`        | String            | Registre du Commerce et du Crédit Mobilier        |
| `nif`         | String            | Numéro d'Identification Fiscale                   |
| `logo`        | String? (MediumText) | Logo (URL ou data-URI), nullable               |
| `createdAt` / `updatedAt` | DateTime | Horodatages                                  |

Relations : `taxes Taxe[]` et `modesPaiement ModePaiementConfig[]` (`schema.prisma:360-361`).

### 3.2 Validation

`web/app/src/lib/validations/parametres.ts:3` — `parametresSchema` :

- `nomCommerce` : 1 à 255 car., **obligatoire** ;
- `adresse` (≤ 500), `telephone` (≤ 50), `rccm` (≤ 100), `nif` (≤ 100) : optionnels, défaut `""` ;
- `email` : email valide **ou** chaîne vide (≤ 255), défaut `""` ;
- `logo` : string nullable optionnel.

### 3.3 API

`web/app/src/app/api/parametres/route.ts`

- `GET` (`route.ts:17`) : retourne le singleton `default`, ou un objet de **valeurs par défaut
  vides** `DEFAULT_PARAMETRES` si aucun enregistrement n'existe (`route.ts:6`). Accessible à tout
  utilisateur authentifié.
- `PUT` (`route.ts:33`) : **upsert** du singleton `default` (`route.ts:48`), réservé **ADMIN**.
  Journalise `PARAMETRES_UPDATED` ; le logo est masqué dans les métadonnées du journal
  (`"(logo updated)"`, `route.ts:59`) pour ne pas y stocker le contenu.

> À noter : `web/app/src/app/api/parametres/modes-paiement/` (route + `[code]`) gère les **modes
> de paiement** configurables (`ModePaiementConfig`, `schema.prisma:366`). Hors périmètre direct
> de ce document mais rattaché au même singleton `Parametres`.

### 3.4 Usage dans les tickets PDF

`web/app/src/app/api/tickets/[id]/pdf/route.ts:37` charge le singleton et construit l'objet
`business` injecté dans le PDF :

| Champ ticket | Source                | Repli                |
| ------------ | --------------------- | -------------------- |
| `name`       | `nomCommerce`         | `"AerisPay"`         |
| `address`    | `adresse`             | `""`                 |
| `phone`      | `telephone`           | `""`                 |
| `email`      | `email`               | `""`                 |
| `rccm`       | `rccm`                | `""`                 |
| `nif`        | `nif`                 | `""`                 |
| `logo`       | `logo`                | `null`               |

Le rendu (`pdf-generator.tsx`) affiche le logo s'il est présent (`pdf-generator.tsx:191`) et la
ligne `RCCM: … | NIF: …` quand au moins l'un des deux est renseigné (`pdf-generator.tsx:196`).

### 3.5 Page d'administration

`web/app/src/app/(dashboard)/parametres/page.tsx` — accès `parametres:manage` (ADMIN), sinon
redirection. Charge en parallèle `Parametres` et les modes de paiement, puis rend `ParametresForm`
et `ModesPaiementSection`. L'intitulé de la page précise que ces informations sont « affichées sur
les tickets de caisse ».

---

## 4. Upload

`web/app/src/app/api/upload/route.ts`

### 4.1 Endpoint POST

- **Permission** : `requireRole("ADMIN", "MANAGER")` (`route.ts:9`).
- **Entrée** : `multipart/form-data`, champ `file` (instance `File`).
- **Types acceptés** (`ALLOWED_TYPES`, `route.ts:6`) : `image/jpeg`, `image/png`, `image/webp`,
  `image/avif`. Type non autorisé → 400.
- **Taille max** : `5 Mo` (`MAX_SIZE`, `route.ts:5`). Dépassement → 400.
- **Stockage** : clé `public/produits/<uuid>.<ext>` (`route.ts:35`), envoi via
  `uploadFile()` du module S3.
- **Sortie** : `201` avec `{ data: { url, key } }`.

### 4.2 Endpoint DELETE

- **Permission** : `requireRole("ADMIN", "MANAGER")` (`route.ts:48`).
- **Entrée** : JSON `{ url }`. Dérive la clé via `keyFromUrl(url)` ; URL absente/invalide → 400.
- **Action** : `deleteFile(key)` puis `200`.

### 4.3 Stockage objet (S3 / MinIO)

`web/app/src/lib/s3.ts` — client `@aws-sdk/client-s3` configuré par variables d'environnement
(défauts MinIO local) :

| Variable        | Défaut                  | Rôle                              |
| --------------- | ----------------------- | --------------------------------- |
| `S3_REGION`     | `us-east-1`             | Région                            |
| `S3_ENDPOINT`   | `http://minio:9000`     | Endpoint (path-style forcé)       |
| `S3_ACCESS_KEY` | `minioadmin`            | Clé d'accès                       |
| `S3_SECRET_KEY` | `minioadmin`            | Clé secrète                       |
| `S3_BUCKET`     | `aerispay`              | Bucket                            |
| `S3_PUBLIC_URL` | `<endpoint>/<bucket>`   | Préfixe d'URL publique retournée  |

`uploadFile` (`s3.ts:16`) renvoie `<PUBLIC_URL>/<key>` ; `keyFromUrl` (`s3.ts:41`) reconstruit la
clé à partir de l'URL (retourne `null` si le bucket n'apparaît pas dans l'URL).

> Bien que les clés soient préfixées `public/produits/…`, l'endpoint est générique : il sert aussi
> bien au **logo** de la structure qu'aux **photos de produits**.

---

## 5. Endpoints — récapitulatif

| Méthode | Chemin                       | Permission         | Validation           |
| ------- | ---------------------------- | ------------------ | -------------------- |
| GET     | `/api/taxes`                 | Authentifié        | —                    |
| POST    | `/api/taxes`                 | ADMIN              | `createTaxeSchema`   |
| PUT     | `/api/taxes/[id]`            | ADMIN              | `updateTaxeSchema`   |
| DELETE  | `/api/taxes/[id]`            | ADMIN              | —                    |
| GET     | `/api/parametres`            | Authentifié        | —                    |
| PUT     | `/api/parametres`            | ADMIN              | `parametresSchema`   |
| POST    | `/api/upload`                | ADMIN, MANAGER     | type + taille (≤5 Mo)|
| DELETE  | `/api/upload`                | ADMIN, MANAGER     | `url` présente       |

**Permission `parametres:manage`** (`web/app/src/lib/permissions.ts:24`) : accordée à **ADMIN
uniquement** (absente de MANAGER et CAISSIER). Elle conditionne l'accès aux **pages**
`/taxes` et `/parametres`. Côté API, les écritures taxes/paramètres exigent directement le rôle
`ADMIN` (`requireRole("ADMIN")`).

---

## 6. Tests existants

| Fichier | Couverture |
| ------- | ---------- |
| `web/app/src/__tests__/taxes/api.test.ts` | GET/POST `/api/taxes` : 401 non-auth, liste, tableau vide, 403 CAISSIER, 400 (nom manquant, `taux > 100`), création ADMIN → 201 |
| `web/app/src/__tests__/taxes/taxes-id-api.test.ts` | PUT/DELETE `/api/taxes/[id]` : 401, 403 CAISSIER, update ADMIN, delete ADMIN |
| `web/app/src/__tests__/parametres/api.test.ts` | GET/PUT `/api/parametres` : 401, lecture auth, défauts vides, 403 CAISSIER/MANAGER, 400 (nomCommerce vide, email invalide), upsert ADMIN → 200 |
| `web/app/src/__tests__/parametres/modes-paiement-api.test.ts` | API modes de paiement (rattaché à `Parametres`) |
| `web/app/src/__tests__/upload/upload-api.test.ts` | POST/DELETE `/api/upload` : 401, 403 CAISSIER, 400 fichier manquant/URL manquante/URL invalide, upload ADMIN, delete ADMIN & MANAGER, 500 sur échec S3 |
| `web/app/src/__tests__/lib/seed-parametres.test.ts` | `seedDefaultParametres` : upsert `id "default"`, update no-op, création des 4 modes de paiement par défaut |
| `web/app/src/__tests__/tickets/pdf-api.test.ts` | PDF ticket (consommation `parametres` + `taxesDetail`) |

L'application des taxes aux ventes est par ailleurs vérifiée dans les tests de ventes
(`web/app/src/__tests__/ventes/`, `store/cartStore*.test.ts`).

---

## 7. Note architecture Desktop (cloud-first)

D'après **ADR-006** (`docs/architecture-desktop/09-adr.md:86`), le **catalogue, les prix, les
catégories, les utilisateurs/rôles, les paramètres, les taxes et les seuils** sont des **données de
référence strictement descendantes depuis le cloud** (autorité unique, *last-writer-wins*).

Conséquences pour ce module dans la cible Desktop :

- **Aucune édition au magasin** : la synchronisation de la référence est un **pull simple** avec
  curseur, sans conflit bidirectionnel.
- L'administration des taxes et des paramètres (et donc l'upload du logo) se fait via l'**app web du
  cloud**, pas via l'instance locale du point de vente.
- Les pages `/taxes` et `/parametres` documentées ici (édition ADMIN) correspondent au **modèle
  mono-instance actuel** ; en architecture Desktop multi-sites, elles deviennent en lecture seule
  côté magasin, l'autorité passant au cloud.
