/**
 * TanStack Query hook for fetching products.
 *
 * PREREQUISITE: Install the package before using this hook:
 *   cd web/app && npm install @tanstack/react-query
 *
 * Usage pattern for future hooks:
 *
 * 1. Define the fetch function (typed return)
 * 2. Create the hook using useQuery with a unique queryKey
 * 3. Export the hook and any mutation hooks (useCreateProduit, etc.)
 *
 * Example usage in a component:
 *   const { data, isLoading, error } = useProduits();
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   return <ProduitsList produits={data} />;
 */

import { useQuery } from "@tanstack/react-query";

interface Produit {
  id: string;
  nom: string;
  reference: string;
  codeBarres: string | null;
  prixVente: number;
  stockActuel: number;
  actif: boolean;
}

interface ProduitsResponse {
  data: Produit[];
  total: number;
}

async function fetchProduits(): Promise<ProduitsResponse> {
  const res = await fetch("/api/produits");
  if (!res.ok) {
    throw new Error("Erreur lors du chargement des produits");
  }
  return res.json();
}

/**
 * Hook to fetch the list of products.
 * Uses TanStack Query for caching, background refetching, and error handling.
 */
export function useProduits() {
  return useQuery<ProduitsResponse>({
    queryKey: ["produits"],
    queryFn: fetchProduits,
  });
}
