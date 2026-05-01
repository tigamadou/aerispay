import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { POSInterface } from "@/components/comptoir/POSInterface";
import { hasRole } from "@/lib/permissions";
import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comptoir",
};

export interface ProduitPOS {
  id: string;
  nom: string;
  reference: string;
  codeBarres: string | null;
  prixVente: number;
  stockActuel: number;
  stockMinimum: number;
  actif: boolean;
  categorie: { id: string; nom: string; couleur: string | null };
}

export interface TaxePOS {
  nom: string;
  taux: number;
}

export interface CategoriePOS {
  id: string;
  nom: string;
  couleur: string | null;
}

export default async function ComptoirPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  const role = session.user.role as Role;
  const isCaissier = hasRole(role, ["CAISSIER"]);

  // Check if the user has an open cash register session
  const comptoirSession = isCaissier
    ? await prisma.comptoirSession.findFirst({
        where: {
          userId,
          statut: "OUVERTE",
        },
        select: {
          id: true,
          ouvertureAt: true,
          montantOuvertureCash: true,
          montantOuvertureMobileMoney: true,
        },
      })
    : null;

  // CAISSIER without session → prompt to open one
  if (isCaissier && !comptoirSession) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <svg
              className="h-8 w-8 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Aucune session de comptoir ouverte
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Vous devez ouvrir une session de comptoir avant de pouvoir enregistrer des ventes.
          </p>
          <Link
            href="/comptoir/sessions"
            className="inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Ouvrir une session
          </Link>
        </div>
      </div>
    );
  }

  // ADMIN / MANAGER → read-only mode (no session needed)
  const readOnly = !isCaissier;

  // Fetch products, categories, and active taxes in parallel
  const [produits, categories, activeTaxes] = await Promise.all([
    prisma.produit.findMany({
      select: {
        id: true,
        nom: true,
        reference: true,
        codeBarres: true,
        prixVente: true,
        stockActuel: true,
        stockMinimum: true,
        actif: true,
        categorie: {
          select: {
            id: true,
            nom: true,
            couleur: true,
          },
        },
      },
      orderBy: { nom: "asc" },
    }),
    prisma.categorie.findMany({
      select: {
        id: true,
        nom: true,
        couleur: true,
      },
      orderBy: { nom: "asc" },
    }),
    prisma.taxe.findMany({
      where: { active: true, parametresId: "default" },
      orderBy: { ordre: "asc" },
      select: { nom: true, taux: true },
    }),
  ]);

  // Serialize Decimal fields to numbers
  const serializedProduits: ProduitPOS[] = produits.map((p) => ({
    ...p,
    prixVente: Number(p.prixVente),
  }));

  const serializedCategories: CategoriePOS[] = categories;

  const serializedTaxes: TaxePOS[] = activeTaxes.map((t) => ({
    nom: t.nom,
    taux: Number(t.taux),
  }));

  return (
    <POSInterface
      produits={serializedProduits}
      categories={serializedCategories}
      sessionId={comptoirSession?.id ?? ""}
      readOnly={readOnly}
      taxes={serializedTaxes}
    />
  );
}
