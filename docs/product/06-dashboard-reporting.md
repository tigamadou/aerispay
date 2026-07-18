# 06 — Dashboard & Reporting

> Documentation produit dérivée du **code réel** (source de vérité). Ce document décrit
> l'implémentation telle qu'elle existe dans le dépôt.
>
> Fichiers couverts :
> - `web/app/src/app/(dashboard)/page.tsx` (tableau de bord ADMIN/MANAGER, rendu serveur)
> - `web/app/src/app/api/dashboard/kpis/route.ts` (API KPI, vue allégée CAISSIER)
> - `web/app/src/app/api/comptoir/sessions/[id]/z-report/route.ts` (Z de caisse)
> - `web/app/src/components/dashboard/CaissierDashboard.tsx` (dashboard CAISSIER)
> - `web/app/src/components/dashboard/DashboardCharts.tsx` (graphiques)
> - `web/app/src/components/shared/KPICard.tsx` (carte KPI réutilisable)

---

## 1. Objectif

Le module **Dashboard & reporting** fournit aux exploitants une vue synthétique de
l'activité commerciale et de la caisse :

- **KPI temps réel** : chiffre d'affaires, nombre de ventes, panier moyen,
  répartition espèces / autres modes.
- **Suivi opérationnel** : alertes de stock (alerte / rupture), écarts de caisse
  des sessions fermées du jour, état des périphériques.
- **Graphiques de tendance** (ADMIN/MANAGER) : CA des 7 derniers jours, top 5 des
  produits vendus.
- **Z de caisse** par session : rapport structuré de clôture (ventes, mouvements,
  soldes théoriques, écarts, intégrité).

Le dashboard est servi en deux variantes selon le rôle (cf. §3) :
- **ADMIN / MANAGER** : tableau de bord complet rendu côté serveur
  (`(dashboard)/page.tsx`, `export const dynamic = "force-dynamic"`).
- **CAISSIER** : composant client allégé `CaissierDashboard` alimenté par
  l'API `/api/dashboard/kpis`.

---

## 2. KPI exposés

### 2.1 KPI principaux (API `/api/dashboard/kpis`)

Calculés dans `route.ts` à partir de l'agrégation Prisma. Le périmètre temporel
est piloté par le paramètre `period` (`day` par défaut, `week`, `month`, ou
`custom` via `dateFrom`/`dateTo`).

| KPI | Champ JSON | Calcul | Source (`kpis/route.ts`) |
|-----|-----------|--------|--------------------------|
| CA (revenue) | `revenue` | Somme `vente.total` des ventes `VALIDEE` sur la période | `route.ts:78-82,125` |
| Nombre de ventes | `salesCount` | `_count` des ventes `VALIDEE` | `route.ts:81,126` |
| Panier moyen | `averageBasket` | `Math.round(revenue / salesCount)` (0 si aucune vente) | `route.ts:127` |
| Espèces | `cashTotal` | Somme `paiement.montant` où `mode = ESPECES` sur les mêmes ventes | `route.ts:83-89,128` |
| Autres modes | `nonCashTotal` | `max(0, revenue - cashTotal)` | `route.ts:129` |
| Session ouverte | `openSession` | Session `OUVERTE` de l'utilisateur courant (id, heure ouverture, fonds cash/MM) ou `null` | `route.ts:90-93,197-204` |
| Écarts de caisse | `cashDiscrepancy` | Voir §2.2 | `route.ts:94-97,131-144,205-210` |
| Périphériques | `peripherals` | Voir §2.3 | `route.ts:184-185,211-221` |
| CA 7 jours | `salesLast7Days` | Tableau `{date, revenue}` agrégé par jour, **ADMIN/MANAGER uniquement** | `route.ts:101-107,152-164` |
| Top 5 produits | `topProducts7Days` | `groupBy(produitId)` des lignes de vente `VALIDEE`, trié par quantité desc, **ADMIN/MANAGER uniquement** | `route.ts:109-120,166-181` |

Notes de calcul :
- Le filtre de base est `statut = "VALIDEE"` + `dateVente` dans la plage
  (`route.ts:59-63`).
- Pour un **CAISSIER**, le `where` est restreint à ses propres ventes
  (`userId: result.user.id`, `route.ts:62`) et sessions (`route.ts:68`).
- `salesLast7Days` est toujours calculé sur une fenêtre fixe de 7 jours glissants
  (`sevenDaysAgo` → fin du jour courant), indépendamment du paramètre `period`
  (`route.ts:72-75,98-122`). Les jours sans vente sont initialisés à 0
  (`route.ts:154-157`).
- Les montants `Prisma.Decimal` sont convertis via `Number(...)`.

### 2.2 KPI écarts de caisse (`cashDiscrepancy`)

Agrégation des sessions `FERMEE` dont `fermetureAt` tombe dans la période
(`route.ts:65-69,94-97`). Pour chaque session, `ecartTotal = ecartCash +
ecartMobileMoney` (`route.ts:136`).

| Champ JSON | Signification |
|-----------|---------------|
| `sessionsCount` | Nombre de sessions fermées sur la période |
| `discrepancyCount` | Nombre de sessions avec un écart non nul |
| `totalExcedent` | Somme des écarts positifs (excédent) |
| `totalManquant` | Somme des valeurs absolues des écarts négatifs (manquant) |

> Note : l'API `/api/dashboard/kpis` ne retient que le statut `FERMEE`
> (`route.ts:66`), tandis que la page serveur ADMIN/MANAGER inclut aussi
> `VALIDEE`, `FORCEE`, `CORRIGEE` (cf. §2.4, `page.tsx:66`). Les deux sources
> peuvent donc afficher des chiffres d'écarts légèrement différents.

### 2.3 État des périphériques (`peripherals`)

Lu depuis la configuration via `getPrinterConfig()` et `getCashDrawerConfig()`
(`lib/receipt/thermal-printer`, `route.ts:3,184-185`). Il s'agit de la
**configuration déclarée**, pas d'un test de connexion matériel en direct.

| Champ JSON | Contenu |
|-----------|---------|
| `peripherals.printer` | `{ enabled, type, interface }` |
| `peripherals.cashDrawer` | `{ enabled, mode }` |

### 2.4 KPI de la page serveur ADMIN/MANAGER (`page.tsx`)

La page `(dashboard)/page.tsx` recalcule ses propres KPI côté serveur (sans passer
par l'API) pour la **journée courante** uniquement (`startOfDay` → `endOfDay`,
`page.tsx:28-30`) :

| Bloc | Détail | Source (`page.tsx`) |
|------|--------|---------------------|
| CA du jour | `revenueDay` = somme `total` ventes `VALIDEE` du jour | `page.tsx:52-56,85` |
| Ventes du jour | `salesCount` | `page.tsx:86` |
| Panier moyen | `revenueDay / salesCount` (sinon `N/A`) | `page.tsx:87,129` |
| Espèces / Autres | `cashTotal` (paiements `ESPECES`) et `nonCashTotal` | `page.tsx:57-63,88-89,130` |
| Produits en alerte | `stockActuel > stockMinimum` et `≤ 2 × stockMinimum` | `page.tsx:106-108` |
| Produits en rupture | `stockActuel ≤ stockMinimum` | `page.tsx:109-111` |
| Écarts de caisse du jour | Sessions `FERMEE/VALIDEE/FORCEE/CORRIGEE` fermées le jour ; tableau Attendu / Compté / Écart par caissier | `page.tsx:64-104,154-249` |
| Stocks les plus bas | Top 5 produits actifs triés par `stockActuel` asc | `page.tsx:112,251-308` |

Les graphiques (CA 7 jours + top 5 produits) sont rendus par le composant client
`<DashboardCharts />` (`page.tsx:134`), qui appelle lui-même
`/api/dashboard/kpis?period=day` (`DashboardCharts.tsx:32`).

### 2.5 Composant `KPICard`

`components/shared/KPICard.tsx` expose une carte réutilisable
(`{ label, value, sub?, small? }`). À noter : ni `page.tsx` ni
`CaissierDashboard.tsx` n'importent ce composant partagé — chacun redéfinit
localement sa propre fonction `KpiCard` (`page.tsx:313-321`,
`CaissierDashboard.tsx:285-293`). Le composant partagé est donc présent mais
sous-utilisé sur ces deux écrans.

---

## 3. Visibilité par rôle

L'accès aux KPI est gouverné par la permission **`rapports:consulter`**
(`lib/permissions.ts:21`), accordée à **ADMIN** et **MANAGER**, mais **pas** à
**CAISSIER** (`permissions.ts:39,53,55-58`).

| Élément | ADMIN | MANAGER | CAISSIER |
|---------|:-----:|:-------:|:--------:|
| Tableau de bord complet (`page.tsx`) | Oui | Oui | Non |
| Dashboard allégé (`CaissierDashboard`) | — | — | Oui |
| KPI CA / ventes / panier / espèces | Oui (global) | Oui (global) | Oui (limité à ses ventes) |
| Graphiques CA 7 jours + top 5 | Oui | Oui | Non (`salesLast7Days`/`topProducts7Days` omis) |
| Écarts de caisse, état périphériques | Oui | Oui | Oui (ses sessions) |
| Z de caisse (`/z-report`) | Oui | Oui | Non (403) |

Mécanismes :
- `page.tsx:21-25` : si `hasPermission(role, "rapports:consulter")` est faux, la
  page renvoie `<CaissierDashboard />` au lieu des KPI complets.
- `kpis/route.ts:55` : `isCaissier` restreint les requêtes aux données de
  l'utilisateur et omet `salesLast7Days` / `topProducts7Days`
  (`route.ts:99-122,222-225`).
- L'API `/api/dashboard/kpis` ne vérifie **que** l'authentification
  (`requireAuth`, `route.ts:40-41`) — tout utilisateur connecté y accède, la
  différenciation se fait sur le contenu (vue allégée), pas par un 403.

---

## 4. Z de caisse de session

**Endpoint** : `GET /api/comptoir/sessions/[id]/z-report`
(`web/app/src/app/api/comptoir/sessions/[id]/z-report/route.ts`).

### 4.1 Format

Le Z de caisse est renvoyé en **JSON structuré** : `Response.json({ data: report })`
(`z-report/route.ts:134`). **Ce n'est pas un PDF** ni un flux d'impression
thermique — c'est un objet de données destiné à être consommé par le client / une
future couche de rendu.

### 4.2 Permission et statuts

- Auth requise puis permission **`rapports:consulter`**, sinon **403**
  (`z-report/route.ts:19-21`). Donc ADMIN et MANAGER uniquement.
- Le rapport n'est disponible que pour les sessions dont le statut figure dans
  `["VALIDEE", "FORCEE", "CORRIGEE", "FERMEE"]` (`z-report/route.ts:5`). Sinon
  (ex. `OUVERTE`) → **422** (`z-report/route.ts:53-58`).
- Session introuvable → **404** (`z-report/route.ts:49-51`).

### 4.3 Contenu du rapport

Objet `report` (`z-report/route.ts:77-132`) :

| Section | Contenu | Source |
|---------|---------|--------|
| `session` | id, statut, caissier (`user`), valideur, `ouvertureAt`, `fermetureAt`, `demandeCloturAt`, fond de caisse cash & mobile money, `motifForceClose` | `route.ts:78-89` |
| `ventes` | `nombre`, `total` (somme des `total`), `detail` (liste des ventes `VALIDEE` : id, numéro, total, date) | `route.ts:31-35,64-65,90-94` |
| `mouvements.liste` | Mouvements de caisse de la session via `listMovements(id)` : type, mode, montant, motif, référence, auteur, vente liée, date | `route.ts:60,95-106` |
| `mouvements.parType` | Agrégat `{ count, total }` par type de mouvement | `route.ts:68-75,107` |
| `soldesTheoriques` | Soldes théoriques par mode via `computeSoldeTheoriqueParMode(id)` | `route.ts:61,109` |
| `declarations` | `caissier` et `valideur` (montants déclarés par mode) | `route.ts:110-113` |
| `ecarts` | Écarts par mode (`session.ecartsParMode`) | `route.ts:114` |
| `integrite` | `hash` (hash d'intégrité) + `hashSessionPrecedente` (chaînage) | `route.ts:115-118` |
| `correction` | Si `sessionCorrective` existe : id, notes, hash, mouvements correctifs ; sinon `null` | `route.ts:36-46,119-131` |

Le commentaire d'en-tête identifie l'action métier **`ACT-GENERATE-Z`**
(`z-report/route.ts:8`).

---

## 5. Endpoints

| Méthode & route | Rôle / permission | Réponse | Fichier |
|-----------------|-------------------|---------|---------|
| `GET /api/dashboard/kpis` | Authentifié (contenu réduit pour CAISSIER) | `{ data: {...KPI} }` JSON | `api/dashboard/kpis/route.ts` |
| `GET /api/comptoir/sessions/[id]/z-report` | `rapports:consulter` (ADMIN, MANAGER) | `{ data: report }` JSON ; 403/404/422/500 | `api/comptoir/sessions/[id]/z-report/route.ts` |

Paramètres de `/api/dashboard/kpis` (query) :

| Param | Valeurs | Effet |
|-------|---------|-------|
| `period` | `week`, `month` (sinon `day` par défaut) | Plage temporelle prédéfinie (`route.ts:47-53`) |
| `dateFrom` | date ISO | Active le mode `custom` (début de journée) (`route.ts:11-16,51-52`) |
| `dateTo` | date ISO | Borne de fin du mode `custom` (fin de journée, défaut = maintenant) |

Codes de réponse `/api/dashboard/kpis` : 200 (succès), 401 (non authentifié via
`requireAuth`), 500 (erreur serveur, `route.ts:228-231`).

---

## 6. Tests existants

Fichier : `web/app/src/__tests__/comptoir/z-report-api.test.ts` (Vitest, mocks de
`@/lib/permissions`, `@/lib/db`, `@/lib/services/cash-movement`).

| Cas testé | Attendu | Ligne |
|-----------|---------|-------|
| Sans authentification | 401 | `z-report-api.test.ts:82-86` |
| Sans permission `rapports:consulter` | 403 | `:88-94` |
| Session inexistante | 404 | `:96-102` |
| Session `OUVERTE` | 422 + message contient « OUVERTE » | `:104-115` |
| Session `VALIDEE` | 200 + `session.id`, `ventes.nombre`, `ventes.total` | `:117-127` |
| Session `FORCEE` | 200 | `:129-138` |
| Présence d'une `sessionCorrective` | `correction` non null, 1 mouvement | `:140-159` |
| Erreur DB | 500 | `:161-167` |

Couverture : l'endpoint **Z de caisse** est bien testé (auth, permission, statuts,
contenu, correction, erreur). En revanche, **aucun test dédié n'a été trouvé pour
`/api/dashboard/kpis`** ni pour les composants dashboard (`CaissierDashboard`,
`DashboardCharts`) dans le périmètre examiné.

---

## 7. Ce qui manque encore (constats, sans extrapolation)

- **Pas d'export PDF du Z de caisse** : le `z-report` est purement JSON
  (`z-report/route.ts:134`). Aucune génération `@react-pdf/renderer` ni impression
  thermique sur cet endpoint.
- **Pas d'export CSV** : aucun endpoint ni paramètre d'export CSV/Excel constaté
  pour les KPI ou le reporting.
- **Pas de tests sur `/api/dashboard/kpis`** ni sur les composants du dashboard.
- **Double source de vérité des KPI** : la page serveur (`page.tsx`) recalcule les
  KPI du jour indépendamment de l'API, avec un périmètre de statuts de sessions
  différent (§2.4) — risque d'incohérence d'affichage entre la page et l'API.
- **`KPICard` partagé sous-utilisé** : les deux dashboards redéfinissent leur carte
  KPI localement au lieu d'importer `components/shared/KPICard.tsx`.
- **État périphériques déclaratif** : `peripherals` reflète la configuration, pas
  un statut de connexion matériel temps réel.
