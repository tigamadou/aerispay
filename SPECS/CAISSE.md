# Spec — Module Gestion de Caisse (POS)

## Objectif
Interface point de vente intuitive permettant à un caissier de réaliser des ventes rapides avec encaissement multi-modes, génération de tickets et compatibilité matériel de caisse : imprimante ticket, douchette lecteur de code-barres et tiroir-caisse.

---

## Entités

### CashSession
| Field | Type | Règles |
|---|---|---|
| `openedAt` | DateTime | Auto, heure d'ouverture |
| `closedAt` | DateTime? | Null si session ouverte |
| `openingAmount` | Decimal | Fond de caisse initial, obligatoire |
| `closingAmount` | Decimal? | Montant compté à la clôture |
| `status` | Enum | OPEN / CLOSED |
| `userId` | String | Caissier qui a ouvert la session |

### Sale
| Field | Type | Règles |
|---|---|---|
| `number` | String unique | Format `VTE-YYYY-NNNNN`, auto-incrémenté |
| `subtotal` | Decimal | Somme des lignes avant remise |
| `discount` | Decimal | Montant remise globale (défaut 0) |
| `vat` | Decimal | TVA totale calculée |
| `total` | Decimal | Montant final TTC |
| `status` | Enum | COMPLETED / CANCELLED / REFUNDED |
| `clientName` | String? | Optionnel, pour fidélisation future |
| `sessionId` | String | Session de caisse active |
| `userId` | String | Caissier |

### SaleLine
| Field | Type | Règles |
|---|---|---|
| `quantity` | Int | > 0 |
| `unitPrice` | Decimal | Prix au moment de la vente (snapshot) |
| `discount` | Decimal | Remise sur la ligne (défaut 0) |
| `vat` | Decimal | TVA du produit (snapshot) |
| `subtotal` | Decimal | quantity × unitPrice × (1 - remise%) |
| `productId` | String | Référence produit |
| `saleId` | String | Vente parente |

### Payment
| Field | Type | Règles |
|---|---|---|
| `method` | Enum | CASH, CARD, MOBILE_MONEY, CHECK, WIRE_TRANSFER |
| `amount` | Decimal | Montant encaissé |
| `reference` | String? | Référence transaction (mobile money, etc.) |
| `saleId` | String | Vente associée |

---

## Règles Métier

### Sessions
- **Une seule session ouverte** par caissier à la fois
- Un caissier ne peut pas vendre si aucune session n'est ouverte
- La clôture de session calcule automatiquement le total des ventes et le solde théorique
- Seul ADMIN ou MANAGER peut clôturer la session d'un autre utilisateur

### Numérotation des ventes
- Format : `VTE-{YYYY}-{NNNNN}` (ex: `VTE-2026-00042`)
- Numéro séquentiel basé sur l'année fiscale
- Généré côté serveur lors de la création de la vente (champ `number`)

### Calculs
```
sous-total ligne  = quantity × unitPrice × (1 - remise_ligne / 100)
sous-total vente  = Σ(sous-total lignes)
remise globale    = montant fixe OU pourcentage sur sous-total
base TVA          = sous-total - remise globale
TVA               = Σ(base_ligne × tva_produit / 100)
TOTAL TTC         = subtotal - discount + TVA (aligné modèle)
```

### Paiement multi-modes
- La somme des paiements doit être ≥ total TTC
- En espèces : monnaie rendue = amount reçu - total TTC
- Maximum 2 modes de paiement par vente (MVP)

### Stock lors d'une vente
- Vérification stock disponible avant validation (pas de vente à découvert)
- Décrémentation atomique (transaction Prisma sur `Product.currentStock`)
- Si un produit est en rupture → erreur 422 avec message explicite

### Périphériques de caisse
- **Douchette code-barres** : support prioritaire des lecteurs USB/HID en mode clavier. Un scan remplit la barre de recherche ou ajoute directement le produit si le code correspond à une référence / code-barres unique.
- **Imprimante ticket** : impression thermique ESC/POS après validation de vente, avec fallback PDF si l’imprimante est désactivée ou indisponible.
- **Tiroir-caisse** : ouverture automatique après paiement `CASH` validé, via impulsion ESC/POS envoyée à l’imprimante connectée au tiroir (RJ11/RJ12) ou via une interface configurée.
- Les erreurs matériel ne doivent jamais annuler une vente déjà validée ; elles déclenchent un message clair et une entrée de journal d’activité si pertinent.

### Annulation
- Réservée à ADMIN / MANAGER
- Uniquement si `status` = COMPLETED
- Restaure le stock automatiquement
- Crée des `StockMovement` de type RETURN

---

## Interface POS (`/caisse`)

### Layout
```
┌─────────────────────────────────────────────────┐
│  Barre de recherche produit                      │
├──────────────────────────┬──────────────────────┤
│                          │                      │
│   Grille de produits     │       PANIER         │
│   (filtrable par         │                      │
│    catégorie)            │  - Articles          │
│                          │  - Quantités         │
│   [ Produit ] [ Produit ]│  - Sous-totaux       │
│   [ Produit ] [ Produit ]│  ──────────────────  │
│   [ Produit ] [ Produit ]│  Sous-total : XXXX   │
│                          │  Remise :     -XXX   │
│                          │  TVA :         XXX   │
│                          │  TOTAL :      XXXX   │
│                          │                      │
│                          │  [   ENCAISSER   ]   │
└──────────────────────────┴──────────────────────┘
```

La barre de recherche doit rester compatible douchette : focus rapide, scan complet détecté par suffixe `Enter`, recherche par `reference` / code-barres, ajout immédiat au panier quand un seul produit actif correspond.

### Carte Produit dans la grille
- Nom du produit
- Prix de vente TTC
- Badge stock (si alerte ou rupture)
- Couleur de catégorie
- Clic → ajoute au panier (ou incrémente quantité)

### Panier
- Liste articles : Nom | Qté (modifiable) | PU | Total ligne | Supprimer
- Champ remise globale (% ou montant)
- Totaux mis à jour en temps réel
- Bouton "Vider le panier"
- **Zustand store** — persiste si l'utilisateur navigue ailleurs

### Modale de Paiement
1. Affiche le total à payer
2. Sélection mode de paiement (boutons radio)
3. Si CASH :
   - Champ "Montant reçu"
   - Affichage "Monnaie à rendre : X FCFA" en temps réel
4. Si MOBILE_MONEY / CARD :
   - Champ référence transaction (optionnel)
5. Bouton "Valider" → `POST /api/sales`
6. Succès → modal ticket + bouton imprimer + réinitialisation panier
7. Si paiement CASH et tiroir activé → ouverture du tiroir-caisse après validation serveur

---

## Page Sessions (`/caisse/sessions`)

### Écran d'ouverture
- Bouton "Ouvrir la caisse" (si aucune session ouverte)
- Saisie du fond de caisse initial
- Confirmation

### Tableau de bord session active
- Heure d'ouverture
- Fond de caisse
- Total ventes depuis ouverture (live)
- Nombre de transactions
- Bouton "Fermer la session"

### Clôture session
- Saisie du montant compté physiquement
- Comparaison : Solde théorique vs Montant compté
- Affichage écart (positif = excédent, négatif = manquant)
- Confirmation + export récapitulatif PDF

---

## Page Historique Ventes (`/caisse/ventes`)

- Tableau : N° | Date | Caissier | Articles | Total | Mode paiement | Statut
- Filtres : date (range picker), caissier, statut
- Total du filtre visible
- Actions : Voir ticket (PDF) | Annuler (ADMIN/MANAGER seulement)

---

## Zustand Store (Panier, champs alignés API / base)

```ts
// store/cartStore.ts
interface CartItem {
  productId: string
  name: string
  unitPrice: number
  vat: number
  quantity: number
  lineDiscount: number
}

interface CartStore {
  items: CartItem[]
  globalDiscount: number
  discountType: 'percent' | 'fixed'
  addItem: (product: Product) => void
  updateQuantity: (productId: string, qty: number) => void
  removeItem: (productId: string) => void
  setDiscount: (value: number, type: 'percent' | 'fixed') => void
  clearCart: () => void
  // computed
  subtotal: () => number
  discountAmount: () => number
  vatAmount: () => number
  total: () => number
}
```

---

## Tests Requis
Ces tests sont le point de départ TDD du module Caisse. Écrire d’abord les tests Vitest des transactions et permissions, puis les tests RTL/Playwright des parcours POS critiques.

- [ ] Ouvrir session → status OPEN
- [ ] Tentative de 2ème session simultanée → erreur 409
- [ ] Vente complète → currentStock décrémenté + StockMovement créé
- [ ] Vente avec stock insuffisant → erreur 422, aucune donnée créée
- [ ] Calcul monnaie rendue (CASH) → correct
- [ ] Annulation vente → stock restauré, status CANCELLED
- [ ] CAISSIER ne peut pas annuler → erreur 403
- [ ] Numérotation séquentielle ventes (`number`) → pas de doublon
- [ ] Clôture session → solde théorique calculé correctement
- [ ] Scan douchette code-barres → produit correspondant ajouté au panier
- [ ] Scan inconnu → message "Produit introuvable" sans modifier le panier
- [ ] Vente CASH avec tiroir activé → commande d’ouverture tiroir envoyée après validation
- [ ] Erreur imprimante / tiroir → vente conservée, message clair affiché
