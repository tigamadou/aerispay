# AerisPay — Conventions de Code

> Ces conventions s'appliquent à tout le code du projet. Les agents IA doivent les respecter scrupuleusement.

---

## 1. Nommage

### Fichiers & Dossiers
| Type | Convention | Exemple |
|---|---|---|
| Composants React | PascalCase | `ProductCard.tsx`, `PaymentModal.tsx` |
| Pages Next.js | kebab-case (dossier) | `stock/mouvements/page.tsx` |
| API Routes | kebab-case (dossier) | `api/stock/mouvements/route.ts` |
| Utilitaires / Lib | camelCase | `pdf-generator.ts`, `db.ts` |
| Stores Zustand | camelCase + Store | `cartStore.ts` |
| Schémas Zod | camelCase + Schema | `produitSchema.ts` |
| Types | PascalCase | `CartItem`, `ReceiptData` |
| Enums | PascalCase | `TypeMouvement`, `Role` |

### Variables & Fonctions
```ts
// ✅ Bon
const montantTVA = calculerTVA(sousTotal, tauxTVA)
const estEnRupture = produit.stockActuel <= produit.stockMinimum
async function creerVente(data: NouvelleVente): Promise<Vente> { ... }

// ❌ Mauvais
const x = calc(st, t)
const flag = prod.s <= prod.sm
async function cv(d: any) { ... }
```

### Composants React
```tsx
// ✅ Interface de props nommée et exportée
interface ProductCardProps {
  produit: Produit
  onAddToCart: (produit: Produit) => void
  showStock?: boolean
}

export function ProductCard({ produit, onAddToCart, showStock = true }: ProductCardProps) {
  // ...
}

// ❌ Props inline sans type
export function ProductCard({ produit, onAddToCart, showStock }: any) { ... }
```

---

## 2. Structure des Fichiers

### Composant React standard
```tsx
// 1. Imports externes (React, Next, libs)
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

// 2. Imports internes
import { useCartStore } from '@/store/cartStore'
import type { Produit } from '@prisma/client'

// 3. Types / Interfaces
interface ProductCardProps {
  produit: Produit
  onAddToCart: (produit: Produit) => void
}

// 4. Composant
export function ProductCard({ produit, onAddToCart }: ProductCardProps) {
  // 4a. Hooks
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // 4b. Handlers
  const handleClick = () => {
    onAddToCart(produit)
  }

  // 4c. Render
  return (
    <div className="...">
      {/* contenu */}
    </div>
  )
}
```

### API Route standard
```ts
// lib/validations/produit.ts (importer les schémas depuis ici)
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  // 1. Auth
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Non authentifié' }, { status: 401 })

  // 2. Params / query
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') ?? '1')

  // 3. DB
  try {
    const [items, total] = await prisma.$transaction([
      prisma.produit.findMany({ skip: (page - 1) * 20, take: 20 }),
      prisma.produit.count(),
    ])
    return Response.json({ data: items, total, page })
  } catch (error) {
    console.error('[GET /api/produits]', error)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
```

---

## 3. Tailwind CSS

### Principes
- **Jamais** de CSS custom — Tailwind uniquement
- Classes organisées par ordre : layout → spacing → sizing → colors → typography → effects
- Extraire les classes répétitives en variables ou composants

```tsx
// ✅ Classes organisées
<div className="flex flex-col gap-4 p-6 w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100">

// ✅ Variants conditionnels avec cn() de shadcn
import { cn } from '@/lib/utils'
<div className={cn(
  "px-3 py-1 rounded-full text-sm font-medium",
  stock <= minimum ? "bg-red-100 text-red-700" :
  stock <= 2 * minimum ? "bg-orange-100 text-orange-700" :
  "bg-green-100 text-green-700"
)}>

// ❌ Style inline
<div style={{ padding: '24px', background: 'white' }}>
```

### Couleurs Sémantiques AerisPay
```
Stock Normal  → green-600 / green-100
Stock Alerte  → orange-500 / orange-100
Stock Rupture → red-600 / red-100
Primaire      → indigo-600 (actions, liens)
Succès        → emerald-600
Danger        → red-600
```

---

## 4. Gestion d'État

### TanStack Query — Fetching de données
```ts
// ✅ Hook personnalisé par ressource
// hooks/useProduits.ts
export function useProduits(filters: ProduitsFilters) {
  return useQuery({
    queryKey: ['produits', filters],
    queryFn: () => fetchProduits(filters),
    staleTime: 30_000, // 30 secondes
  })
}

// hooks/useCreateProduit.ts
export function useCreateProduit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: NouveauProduit) => createProduit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produits'] })
      toast.success('Produit créé avec succès')
    },
    onError: (error) => toast.error('Erreur lors de la création'),
  })
}
```

### Zustand — État UI local
```ts
// store/cartStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Persister le panier dans sessionStorage (vide à fermeture de l'onglet)
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (produit) => set(state => {
        const existing = state.items.find(i => i.produitId === produit.id)
        if (existing) {
          return { items: state.items.map(i =>
            i.produitId === produit.id ? { ...i, quantite: i.quantite + 1 } : i
          )}
        }
        return { items: [...state.items, { produitId: produit.id, quantite: 1, ... }] }
      }),
    }),
    { name: 'aerispay-cart', storage: createJSONStorage(() => sessionStorage) }
  )
)
```

---

## 5. Gestion des Erreurs

### Côté serveur (API Routes)
```ts
// Erreurs standardisées
const ERRORS = {
  UNAUTHORIZED:   { status: 401, error: 'Non authentifié' },
  FORBIDDEN:      { status: 403, error: 'Accès refusé' },
  NOT_FOUND:      { status: 404, error: 'Ressource introuvable' },
  VALIDATION:     { status: 400, error: 'Données invalides' },
  CONFLICT:       { status: 409, error: 'Conflit de données' },
  UNPROCESSABLE:  { status: 422, error: 'Opération impossible' },
  SERVER_ERROR:   { status: 500, error: 'Erreur serveur' },
}
```

### Côté client (composants)
```tsx
// Toast notifications (sonner ou react-hot-toast)
import { toast } from 'sonner'

// Succès
toast.success('Produit créé avec succès')

// Erreur
toast.error('Stock insuffisant pour effectuer la vente')

// Loading
const toastId = toast.loading('Création en cours...')
toast.dismiss(toastId)
```

---

## 6. Prisma — Bonnes Pratiques

### Singleton Client
```ts
// lib/db.ts — NE JAMAIS MODIFIER
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### Transactions
```ts
// ✅ Transaction pour opérations atomiques (vente + stock)
const result = await prisma.$transaction(async (tx) => {
  const vente = await tx.vente.create({ data: venteData })
  
  for (const ligne of lignes) {
    // Vérifier le stock
    const produit = await tx.produit.findUnique({ where: { id: ligne.produitId } })
    if (!produit || produit.stockActuel < ligne.quantite) {
      throw new Error(`Stock insuffisant pour ${produit?.nom}`)
    }
    
    // Créer ligne
    await tx.ligneVente.create({ data: { ...ligne, venteId: vente.id } })
    
    // Décrémenter stock
    await tx.produit.update({
      where: { id: ligne.produitId },
      data: { stockActuel: { decrement: ligne.quantite } }
    })
    
    // Mouvement stock
    await tx.mouvementStock.create({
      data: { produitId: ligne.produitId, type: 'SORTIE', quantite: ligne.quantite, venteId: vente.id }
    })
  }
  
  return vente
})
```

### Sélections Prisma
```ts
// ✅ Sélectionner uniquement les champs nécessaires
const produits = await prisma.produit.findMany({
  select: { id: true, nom: true, prixVente: true, stockActuel: true },
})

// ❌ Éviter le select * en production
const produits = await prisma.produit.findMany()
```

---

## 7. Formatage des Données

### Montants / Devises
```ts
// lib/utils.ts
export function formatMontant(montant: number | Decimal, devise = 'FCFA'): string {
  return `${new Intl.NumberFormat('fr-FR').format(Number(montant))} ${devise}`
}
// → "51 679 FCFA"

// Ne jamais afficher de décimales sur les montants en FCFA
```

### Dates
```ts
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}
// → "23/04/2026"

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
// → "23/04/2026 à 14:35"
```

### Numérotation
```ts
// Numéro de vente séquentiel
export function genererNumeroVente(sequence: number): string {
  return `VTE-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`
}
// → "VTE-2026-00042"

// Référence produit auto
export function genererReference(): string {
  return `PRD-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
}
// → "PRD-X4K2M"
```

---

## 8. Internationalisation (Langue)

- L'interface est **entièrement en français**
- Les messages d'erreur API sont en français
- Les logs console peuvent être en anglais (convention technique)
- Les noms de variables/fonctions sont en **anglais** (convention code)
- Les commentaires de code peuvent être en français ou anglais

```ts
// ✅ Noms de variables en anglais, messages UI en français
const isLoading = true
const errorMessage = 'Le stock est insuffisant pour effectuer cette vente.'
```

---

## 9. Journal d’activité (audit)

- Toute opération listée ou analogue dans `SPECS/ACTIVITY_LOG.md` doit déclencher un **`logActivity`** côté serveur après succès (ou échec d’authentification pertinent), via `lib/activity-log.ts`.
- Ne jamais stocker mots de passe, tokens ni secrets dans `metadata` (JSON).
- `GET /api/activity-logs` : réservé `ADMIN` et `MANAGER` ; pas d’exposition des logs à un `CAISSIER`.

---

## 10. Tests et TDD

- **TDD obligatoire** : pour chaque nouvelle fonctionnalité, correction métier ou régression, écrire d’abord les tests qui expriment le comportement attendu.
- Priorité des tests : API Routes et logique métier avec Vitest, composants critiques avec React Testing Library, parcours utilisateur critiques avec Playwright.
- Les tests doivent couvrir le chemin nominal, les erreurs de validation, les permissions et les effets de bord persistants (transactions, stock, ventes, logs d’activité).
- L’implémentation commence seulement après avoir défini les tests pertinents ; un ticket n’est accepté que lorsque les tests ciblés passent avec `npm run test` et, si applicable, `npm run test:e2e`.
- Ne pas affaiblir ou supprimer un test existant pour faire passer une implémentation ; corriger le comportement ou actualiser le test uniquement si la spec a changé.

---

## 11. Conteneurisation (Docker)

- Fichiers Compose : `docker-compose.yml` (développement) et `docker-compose.prod.yml` (production) — ne pas les fusionner.
- Noms d’exemples d’environnement : `web/development.env.example` et `web/production.env.example` ; ne jamais committer de secrets.
- Détails opérationnels (ports, volumes, commandes) : `DOCKER.md`.

---

*AerisPay Conventions · Version 1.1 · Avril 2026*
