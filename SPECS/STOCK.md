# Spec — Module Gestion de Stock

## Objectif
Permettre la gestion complète du catalogue produits et le suivi en temps réel des niveaux de stock.

---

## Entités

### Product
| Field | Type | Règles |
|---|---|---|
| `reference` | String unique | Auto-générée format `PRD-XXXXX` ou saisie manuelle |
| `barcode` | String unique? | Code-barres scanné par douchette, optionnel mais unique si renseigné |
| `name` | String | Requis, min 2 chars |
| `description` | String? | Optionnel |
| `image` | String? | URL, optionnel MVP |
| `purchasePrice` | Decimal | Requis, > 0 |
| `salePrice` | Decimal | Requis, > purchasePrice |
| `vat` | Decimal | 0–100, défaut 0 |
| `unit` | String | "unité", "kg", "litre", "paquet"... |
| `currentStock` | Int | Calculé, ne jamais modifier directement |
| `minimumStock` | Int | Défaut 5, seuil d'alerte |
| `maximumStock` | Int? | Optionnel, capacité max |
| `active` | Boolean | Défaut true, soft delete |
| `categoryId` | String | Clé vers Category |

### Category
| Field | Type | Règles |
|---|---|---|
| `name` | String | Requis, unique |
| `description` | String? | Optionnel |
| `color` | String? | Code hex `#RRGGBB` |

### StockMovement
| Field | Type | Règles |
|---|---|---|
| `type` | Enum | IN, OUT, ADJUSTMENT, RETURN, LOSS |
| `quantity` | Int | Toujours positif — le type détermine le sens |
| `quantityBefore` | Int | Snapshot avant opération |
| `quantityAfter` | Int | Snapshot après opération |
| `reason` | String? | Obligatoire pour ADJUSTMENT et LOSS |
| `reference` | String? | Numéro bon de livraison, etc. (réf. externe) |
| `productId` | String | Référence produit |

---

## Règles Métier

### Niveaux de stock
- `currentStock > 2 × minimumStock` → statut **Normal** (vert)
- `minimumStock < currentStock ≤ 2 × minimumStock` → statut **Alerte** (orange)
- `currentStock ≤ minimumStock` → statut **Rupture** (rouge)
- `currentStock = 0` → statut **Épuisé** (rouge foncé)

### Mouvements
- **IN** : réapprovisionnement fournisseur — augmente le stock
- **OUT** : consommation directe hors vente — diminue le stock
- **ADJUSTMENT** : correction d'inventaire — peut augmenter ou diminuer (quantité négative autorisée pour ce type uniquement côté logique métier)
- **RETURN** : retour client suite annulation vente — augmente le stock (géré automatiquement)
- **LOSS** : casse, vol, péremption — diminue le stock, reason obligatoire

### Suppression de produit
- Pas de suppression physique — désactivation logique (`active = false`)
- Un produit inactif n'apparaît plus dans le POS
- Un produit inactif reste dans l'historique des ventes

### Prix
- `salePrice` doit être supérieur à `purchasePrice` (validation Zod)
- La marge brute est calculée côté client : `(salePrice - purchasePrice) / salePrice × 100`

### Code-barres
- Un produit peut avoir un `barcode` optionnel, unique, utilisé par la douchette lecteur de code-barres en caisse.
- Le POS recherche d’abord par `barcode`, puis par `reference`, puis par texte libre.
- Un scan ne doit jamais ajouter un produit inactif au panier.

---

## Interfaces Utilisateur

### Page `/stock` — Liste des produits
- **Colonnes :** Référence | Nom | Catégorie | Prix vente | Stock | Statut | Actions
- **Filtres :**
  - Catégorie (select)
  - Statut stock (tous / normal / alerte / rupture)
  - Actif/Inactif
  - Recherche texte (nom ou référence)
- **Tri :** par nom, stock, prix (asc/desc)
- **Pagination :** 20 par page côté serveur
- **Actions rapides :** Entrée stock (icône +), Éditer, Voir

### Page `/stock/nouveau` et `/stock/[id]`
- Formulaire complet avec sections : Informations, Prix & TVA, Stock
- Génération automatique de référence si champ vide
- Preview calcul marge en temps réel
- Upload image (optionnel, MVP sans upload)

### Page `/stock/categories`
- Liste des catégories avec nombre de produits
- Formulaire inline création
- Suppression si aucun produit rattaché

### Page `/stock/mouvements`
- Formulaire rapide : sélection produit + type + quantité + motif
- Tableau historique avec filtres : produit, type, période
- Export CSV

### Widget Dashboard `/`
- Compteur produits en rupture (cliquable → /stock avec filtre rupture)
- Top 3 produits les plus bas en stock

---

## Validations Zod (champs alignés sur la base)

```ts
// lib/validations/product.ts
export const ProductSchema = z.object({
  reference: z.string().optional(),
  barcode: z.string().trim().min(4).max(64).optional(),
  name: z.string().min(2, 'Nom trop court').max(100),
  categoryId: z.string().cuid('Catégorie invalide'),
  purchasePrice: z.number().positive('Prix achat doit être positif'),
  salePrice: z.number().positive('Prix vente doit être positif'),
  vat: z.number().min(0).max(100).default(0),
  unit: z.string().default('unité'),
  minimumStock: z.number().int().min(0).default(5),
  maximumStock: z.number().int().positive().optional(),
  description: z.string().optional(),
}).refine(d => d.salePrice > d.purchasePrice, {
  message: 'Le prix de vente doit être supérieur au prix d\'achat',
  path: ['salePrice'],
})

export const StockMovementSchema = z.object({
  productId: z.string().cuid(),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'LOSS']),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
  reference: z.string().optional(),
}).refine(d => {
  if (d.type === 'ADJUSTMENT' || d.type === 'LOSS') {
    return !!d.reason && d.reason.length > 3
  }
  return true
}, { message: 'Motif obligatoire pour ce type de mouvement', path: ['reason'] })
```

---

## Tests Requis
Ces tests doivent être écrits avant l’implémentation du module Stock selon la démarche **TDD**. Commencer par les tests Vitest des règles métier/API, puis ajouter les tests React Testing Library des formulaires et tableaux.

- [ ] Créer produit avec données valides → 201
- [ ] Créer produit avec salePrice < purchasePrice → 400
- [ ] Entrée stock → currentStock incrémenté + StockMovement créé
- [ ] Sortie stock supérieure au stock disponible → 422
- [ ] Désactivation produit → n'apparaît plus dans POS
- [ ] Filtrage par catégorie → résultats corrects
- [ ] Alerte stock déclenché correctement selon seuils
- [ ] Créer produit avec barcode déjà utilisé → 409
- [ ] Recherche produit par barcode → produit actif correct retourné
