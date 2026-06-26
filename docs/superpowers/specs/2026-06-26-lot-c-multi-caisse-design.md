# Lot C — Multi-caisse / multi-poste (Option B) — Design

> **Statut : ✅ Livré (2026-06-26).** Document de conception conservé comme archive. Comportement
> réel à jour : `docs/product/04-caisse-sessions.md` §14 et `docs/product/03-comptoir-ventes.md` §6.

| | |
|---|---|
| **Date** | 26 juin 2026 |
| **Lot** | C (Option B) — F1.1 (multi-caisse), livré |
| **Priorité** | P0 |
| **Dépend de** | G + A (livrés) |
| **Migration DB** | Oui (`caisseId` sur `ComptoirSession` + backfill) |

## 1. Objectif

Permettre **plusieurs caisses (postes) physiques** dans un magasin, chacune portant ses propres
sessions, soldes et écarts isolés. Aujourd'hui une seule caisse active existe, résolue partout par
`prisma.caisse.findFirst({ where: { active: true } })`, et `ComptoirSession` n'a pas de `caisseId`.
Conséquence : deux caissiers concurrents alimentent le même grand livre → réconciliation incohérente.

Ce lot rattache chaque session à une caisse, isole les soldes par caisse, et fournit la gestion
des caisses (CRUD admin + sélecteur POS).

## 2. Décisions actées

- **Rattachement caisse** : *sélecteur UI + fallback*. L'API d'ouverture accepte un `caisseId`
  optionnel ; s'il est absent et qu'une **seule** caisse est active, fallback automatique ; s'il est
  absent et que **plusieurs** caisses sont actives, erreur `400` (`caisseId` requis).
- **Unicité** : *1 session `OUVERTE` par caisse **ET** 1 par caissier*. Une 2ᵉ ouverture sur une
  caisse déjà ouverte, ou par un caissier ayant déjà une session ouverte, est refusée `409`.
- **Périmètre caisses** : *seed 2 caisses + CRUD admin caisses* (`POST/PUT/DELETE /api/caisse` + page
  `/caisses` ADMIN).
- **Stratégie de test** : *(A)* le seed **dev/prod** crée 2 caisses ; les tests existants gardent
  **une seule** caisse active (fallback → restent verts) ; seul `multi-caissier.test.ts` seede
  explicitement 2 caisses.

## 3. Schéma & migration

### `ComptoirSession`
```prisma
caisseId String
caisse   Caisse @relation(fields: [caisseId], references: [id])
@@index([caisseId, statut])
```

### `Caisse`
```prisma
sessions ComptoirSession[]   // relation inverse
```

### Migration `lot_c_session_caisse`
- Ajout colonne `caisseId` (NOT NULL).
- **Backfill** : `UPDATE comptoir_sessions SET caisseId = 'caisse-principale'` pour toutes les
  sessions existantes avant d'appliquer la contrainte NOT NULL / FK.
- Ajout index `(caisseId, statut)`.

## 4. Ouverture de session (`POST /api/comptoir/sessions`)

- `openSessionSchema` : ajouter `caisseId: z.string().optional()`.
- **Résolution de la caisse** (avant la transaction) :
  1. si `caisseId` fourni → `findUnique` ; rejeter `422` si introuvable ou `active === false` ;
  2. sinon → `findMany({ active: true })` :
     - exactement 1 → fallback sur celle-ci ;
     - 0 → `422` « Aucune caisse active configurée » ;
     - ≥ 2 → `400` « caisseId requis : plusieurs caisses actives ».
- **Solde d'ouverture / FOND_OUVERTURE** : calculés sur la caisse résolue (remplace le
  `findFirst({active})` ligne 60 et le `caisse.id` ligne 175).
- **Unicité (dans la transaction `$transaction`)** :
  ```
  refus 409 si  comptoirSession (statut OUVERTE) avec caisseId = résolu   → "caisse déjà ouverte"
  refus 409 si  comptoirSession (statut OUVERTE) avec userId  = caissier  → "vous avez déjà une session ouverte"
  ```
  (remplace l'actuel check global `{ statut: "OUVERTE" }`).
- `created.caisseId = caisse.id`.

## 5. Câblage `session.caisseId` (suppression des `findFirst({active})`)

Remplacer la résolution implicite par la caisse de la session déjà chargée :

| Fichier | Ligne actuelle | Session chargée | Remplacement |
|---|---|---|---|
| `ventes/route.ts` | 98 | L89 | `session.caisseId` |
| `ventes/[id]/annuler/route.ts` | 33 | L40 | `session.caisseId` |
| `sessions/[id]/validate/route.ts` | 119 | L33 | `session.caisseId` |
| `sessions/[id]/route.ts` (GET) | 89 | L21 | `session.caisseId` |
| `sessions/[id]/route.ts` (PUT) | 164 | L135 | `session.caisseId` |
| `comptoir/movements/route.ts` | 155 | L111 | `session.caisseId` |
| `sessions/[id]/correct/route.ts` | 73 | L48 (`originalSession`) | session corrective héritée de `originalSession.caisseId` |

`select`/`include` des `findUnique` de session : ajouter `caisseId`.

> `GET /api/caisse/route.ts` et `caisse/[id]/soldes/route.ts` utilisent `active:true` pour
> **lister/monitorer** les caisses — ce n'est pas une résolution de caisse de session, on n'y touche pas.

## 6. CRUD admin caisses

- **Validation** `lib/validations/caisse.ts` :
  ```ts
  caisseSchema = z.object({ nom: z.string().min(1).max(100), active: z.boolean().optional() })
  ```
- `POST /api/caisse` (ADMIN) : crée `{ nom, active=true }`, `logActivity`, `201`.
- `PUT /api/caisse/[id]` (ADMIN) : modifie `nom`/`active`, `logActivity`.
- `DELETE /api/caisse/[id]` (ADMIN) : **soft-delete** (`active=false`) — jamais de suppression dure
  (intégrité des mouvements/sessions). Refus `409` si une session `OUVERTE` est rattachée.
- Actions `logActivity` : `CAISSE_CREATED`, `CAISSE_UPDATED`, `CAISSE_DEACTIVATED`.
- Réponses standard `{ data }` / `{ error }`.

## 7. Page admin `/caisses` (ADMIN)

- Table des caisses (nom, statut actif, date) + formulaire création/édition + bouton désactivation.
- Lien dans la navigation conditionnée au rôle ADMIN.

## 8. Seed

`lib/seed/caisse.ts` : conserver `caisse-principale` (rétrocompat tests) **et** ajouter une 2ᵉ caisse
active `caisse-2` (« Caisse 2 »). Les seuils restent inchangés.

## 9. UI POS — `SessionManager`

- À l'ouverture : `GET /api/caisse`.
- Si **> 1** caisse active → afficher un `Select` (shadcn) de choix de caisse ; le `caisseId`
  sélectionné est envoyé dans le `POST`.
- Si **1** caisse active → champ masqué (fallback serveur).

## 10. Tests (TDD — écrits d'abord)

- **`comptoir/multi-caissier.test.ts`** (nouveau) : 2 caisses, 2 caissiers ; sessions `OUVERTE`
  simultanées sur des caisses distinctes ; ventes/mouvements ; les soldes et écarts de chaque session
  sont **isolés** (le solde de la session A ne contient pas les mouvements de B).
- **`comptoir/session-caisse-unicite.test.ts`** (maj) :
  - 2ᵉ session sur une caisse déjà `OUVERTE` → 409 ;
  - 2ᵉ session par un caissier ayant déjà une session ouverte → 409 ;
  - session sur une **autre** caisse libre, par un **autre** caissier → 201.
- **`caisse/crud.test.ts`** (nouveau) : POST/PUT/DELETE — ADMIN only (403 sinon) ; DELETE = soft ;
  DELETE refusé si session ouverte.
- **`comptoir/session-fallback-caisse.test.ts`** (nouveau) : `caisseId` absent + 1 seule active → 201
  (fallback) ; `caisseId` absent + ≥2 actives → 400.
- Mise à jour des tests existants dont le `select`/mock de session doit exposer `caisseId`.

## 11. Critères d'acceptation

- [ ] `caisseId` présent sur `ComptoirSession`, migration + backfill appliqués.
- [ ] Plus aucun `findFirst({ active:true })` pour résoudre la caisse d'une vente/mouvement/session
      (les usages monitoring `GET /api/caisse`, `soldes` exclus).
- [ ] Ouverture : fallback 1 caisse, `400` si ≥2 sans `caisseId`, `422` si caisse inactive/introuvable.
- [ ] Unicité : 1 `OUVERTE` par caisse ET 1 par caissier (tests verts).
- [ ] Soldes/écarts isolés par caisse (`multi-caissier.test.ts` vert).
- [ ] CRUD admin caisses (ADMIN only, soft-delete) + page `/caisses`.
- [ ] Seed dev/prod = 2 caisses ; suite de tests verte (839+ tests).

## 12. Hors périmètre (YAGNI)

- Affectation caisse↔utilisateur (champ sur `User`).
- Multi-organisation / `storeId` (Lot F).
- Préfixe de numéro de vente par caisse (`VTE-<caisse>-YYYY-NNNNN`) — la séquence reste globale/annuelle.
