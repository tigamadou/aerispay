# Spec — Tableau de bord & indicateurs (KPI)

> **Version doc :** 1.1.0 (alignée `ROADMAP` / `PAGES_MVP`)  
> **Objectif :** Définir les **indicateurs** affichés sur la page d’accueil (`/`) et le **contrat** de `GET /api/dashboard/kpis`, sans ambiguïté sur les périmètres temporels, les agrégations et les **rôles** (`SPECS/AUTH.md`).

---

## 1. Périmètre temporel & fuseau

| Règle | Description |
|--------|-------------|
| **« Jour » (jour J)** | De **00:00:00** à **23:59:59.999** du **calendrier local du point de vente** (pas UTC implicite). |
| **Fuseau** | Configurable côté serveur (ex. variable d’environnement `APP_TIMEZONE`, ex. `Africa/Dakar` ou `Europe/Paris`) ; toutes les requêtes sur les ventes filtrées par date utilisent ce fuseau. |
| **7 derniers jours (graphique)** | J-6 à J (7 points), même fuseau, **un point par jour calendaire** (CA TTC des ventes `COMPLETED` ce jour-là). |

---

## 2. Visibilité par rôle (`SPECS/AUTH.md`)

| Rôle | Accès aux KPI « magasin » (CA global, stock agrégé, top produits, graphique) |
|------|-------------------------------------------------------------------------------|
| `ADMIN` | Oui — vue complète **§3** et **§4**. |
| `MANAGER` | Oui — idem. |
| `CAISSIER` | **Non** — pas de « rapports / KPIs locaux » au sens direction (matrice `AUTH`) : **ne pas** afficher les cartes **§3.1** (tout le magasin) ni le graphique / top magasin **§4**. Voir **§5** (vue allégée). |

---

## 3. KPI — Cartes principales (vue `ADMIN` & `MANAGER`)

Ces indicateurs portent sur les ventes **`COMPLETED`**, filtre **jour J** (cf. §1), **tout le magasin** (instance / base actuelle = un PDV en MVP).

| ID | Libellé UI (exemple) | Définition / formule | Unité / format |
|----|----------------------|------------------------|-----------------|
| **KPI-01** | Chiffre d’affaires (jour) | **Somme** des `Vente.total` (TTC) des ventes du jour J, statut `COMPLETED` (hors `CANCELLED`). | Monnaie locale (ex. FCFA), 0 décimales d’affichage ou 2 si usage comptable |
| **KPI-02** | Nombre de ventes (jour) | **Nombre** de ventes `COMPLETED` le jour J. | Entier (ex. 42) |
| **KPI-03** | Panier moyen (jour) | `KPI-01 / KPI-02` si `KPI-02 > 0`, sinon **0** ou `null` (expliciter côté API : `0` + libellé « N/A » en UI). | Monnaie |
| **KPI-04** | Encaissement espèces (jour) | **Somme** des montants des `Paiement` avec `method = CASH` rattachés à des ventes `COMPLETED` du jour J. | Monnaie |
| **KPI-05** | Autres encaissements (jour) | **Somme** des paiements **non** `CASH` (carte, mobile money, etc.) des ventes `COMPLETED` du jour J. | Monnaie |
| **KPI-06** | Produits en alerte stock | Nombre de produits **actifs** avec `minimumStock < stockActuel ≤ 2 × minimumStock` — aligné `SPECS/STOCK.md` (niveau alerte). | Entier — **clic** : lien vers `/stock?statut=alerte` (ou équivalent query) |
| **KPI-07** | Produits en rupture | Nombre de produits **actifs** avec `stockActuel ≤ minimumStock` (rupture) ou, si la spec `STOCK` distingue « épuisé », compter `stock = 0` en sous-ensemble affichable. | Entier — **clic** : vers `/stock?statut=rupture` (ou `GET /api/stock/alertes` filtré) |

*Remarque :* si le modèle Prisma utilise `Vente` / `Paiement` avec d’autres noms, mapper 1:1 (cf. `ARCHITECTURE_MVP.md`).

---

## 4. Blocs secondaires (vue `ADMIN` & `MANAGER`)

| ID | Composant | Règles |
|----|------------|--------|
| **KPI-08** | **Série 7 jours** | Axe des abscisses : les 7 derniers jours (libellé date court). Axe des ordonnées : **CA TTC** (`COMPLETED` par jour). Composant type graphique (ex. Recharts) — `ROADMAP` **[DASH-02]**. |
| **KPI-09** | **Top 5 produits (7 jours glissants ou 7 jours calendaires)** | Produits classés par **quantité totale vendue** (somme `LigneVente.quantity` sur période **7 derniers jours** calendaires) ; afficher **nom**, **qté totale**, **CA TTC** (option). Limiter à 5. |
| **KPI-10** | **Liste rapide** « Alertes / rupture » (option widget) | Afficher 3–5 **produits** en situation critique (même règles `STOCK.md`) avec lien direct vers fiche ` /stock/[id]`. Comportement reprise du widget `STOCK-UI-05` / `PAGES_MVP` (`/`). |

---

## 5. Vue `CAISSIER` sur `/` (pas de KPI magasin)

| Élément | Règle |
|--------|--------|
| **Message d’accueil** | « Bienvenue, {nom} » + date du jour. |
| **Lien d’action principal** | Bouton ou card vers **`/caisse`** (ouverture / reprise de vente). |
| **Indicateurs personnels (optionnel MVP, recommandé pour UX)** | Uniquement si cohérent TDD : **KPI-11a** = nombre de ventes **dont l’utilisateur courant est le caissier** le jour J ; **KPI-11b** = somme TTC de ces mêmes ventes. *Ne pas* afficher le CA de tout le magasin ni le stock global agrégé. |
| **Masquage** | Cacher toutes les cartes **§3** et blocs **§4** (graphique, top 5 magasin) pour le rôle `CAISSIER`. |

L’API peut exposer un champ `scope: "store" | "self"` selon le rôle pour éviter toute fuite côté client, ou un endpoint partagé qui ne renvoie que le sous-objet autorisé.

---

## 6. API `GET /api/dashboard/kpis`

- **Authentification** : obligatoire.  
- **Rôles** : `ADMIN` et `MANAGER` — corps complet ci-dessous. `CAISSIER` — soit **200** avec payload **allégé** (`self` uniquement + `welcome` meta), soit **200** + `_allowedKeys` explicite ; jamais les totaux magasin.  
- **Méthode** : `GET`  
- **Query (optionnel)** : `date=YYYY-MM-DD` pour forcer le « jour J » (défaut = aujourd’hui) — utile tests / gérant ; validation stricte.

**Exemple de forme de réponse (MVP, à typer côté `lib/validations/`)** :

```ts
// Vue magasin (ADMIN / MANAGER)
{
  "data": {
    "date": "2026-04-29",           // jour J
    "timezone": "Africa/Dakar",
    "revenueDay": 1250000,          // KPI-01
    "salesCountDay": 42,            // KPI-02
    "averageBasketDay": 29762,     // KPI-03 (ou null si 0 vente)
    "cashTotalDay": 800000,         // KPI-04
    "nonCashTotalDay": 450000,     // KPI-05
    "stockAlertCount": 12,          // KPI-06
    "stockOutageCount": 3,         // KPI-07
    "salesLast7Days": [            // KPI-08 — 7 nombres, J-6..J
      { "date": "2026-04-23", "revenue": 980000 },
      { "date": "2026-04-29", "revenue": 1250000 }
    ],
    "topProducts7Days": [          // KPI-09 — max 5
      { "productId": "...", "name": "...", "quantitySold": 120, "revenueTtc": 150000 }
    ],
    "quickStockAlerts": [         // KPI-10 — aperçu, max 5
      { "productId": "...", "name": "...", "stockActuel": 2, "stockMinimum": 5 }
    ]
  }
}
```

**Réponse allégée `CAISSIER` (exemple) :**

```ts
{
  "data": {
    "date": "2026-04-29",
    "self": {
      "mySalesCountDay": 18,
      "myRevenueDay": 210000
    }
  }
}
```

*(Si **KPI-11a/b** ne sont pas au MVP, omettre `self` et se limiter accueil + liens côté UI, sans chiffre.)*

---

## 7. Règles d’implémentation

- **Performance** : les agrégations doivent être exécutées en **SQL** / Prisma (éviter N+1) ; index sur dates de vente, `userId` caissier, `status`.  
- **Sécurité** : vérification **rôle côté serveur** sur chaque agrégat ; ne jamais faire confiance au seul masquage UI.  
- **Cohérence** : mêmes règles de filtre de date que le rapport `DASH-03` (éventuel), pour ne pas montrer des totaux différents.  
- **TDD** : tests Vitest sur l’API (totaux, dates limites, rôle `CAISSIER` sans fuite) ; tests Playwright : dashboard selon rôle.  
- **Log** : `logActivity` en lecture de `/api/dashboard/kpis` : optionnel (peut saturer) ; en MVP **désactivé** sauf exigence audit explicite.

---

## 8. Documents liés

- `SPECS/PAGES_MVP.md` — page `/`  
- `SPECS/AUTH.md` — matrice rapports / caissier  
- `SPECS/STOCK.md` — seuils alerte / rupture  
- `ROADMAP.md` — DASH-01, DASH-02  
- `components/shared/KPICard.tsx` — conteneur visuel des **KPI-01** …

---

*AerisPay — Spec dashboard & KPIs — **doc v1.1.0** — 2026*
