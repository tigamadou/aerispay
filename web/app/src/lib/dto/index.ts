/**
 * Data Transfer Object helpers.
 *
 * Each function converts a Prisma model (or payload with Decimal fields)
 * into a plain-object shape safe for JSON serialization.
 *
 * NOTE: These are defined but NOT yet applied to API routes to avoid
 * frontend breaking changes. Apply them incrementally once the frontend
 * is updated to consume the DTO shapes.
 */

import type { Produit, Vente, User, Categorie, LigneVente, Paiement } from "@prisma/client";

// ─── Produit ──────────────────────────────────────────

interface ProduitDTO {
  id: string;
  reference: string;
  codeBarres: string | null;
  nom: string;
  description: string | null;
  image: string | null;
  prixAchat: number;
  prixVente: number;
  tva: number;
  unite: string;
  stockActuel: number;
  stockMinimum: number;
  stockMaximum: number | null;
  actif: boolean;
  categorieId: string;
  createdAt: string;
  updatedAt: string;
}

export function toProduitDTO(p: Produit): ProduitDTO {
  return {
    id: p.id,
    reference: p.reference,
    codeBarres: p.codeBarres,
    nom: p.nom,
    description: p.description,
    image: p.image,
    prixAchat: Number(p.prixAchat),
    prixVente: Number(p.prixVente),
    tva: Number(p.tva),
    unite: p.unite,
    stockActuel: p.stockActuel,
    stockMinimum: p.stockMinimum,
    stockMaximum: p.stockMaximum,
    actif: p.actif,
    categorieId: p.categorieId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// ─── Vente ────────────────────────────────────────────

interface VenteDTO {
  id: string;
  numero: string;
  dateVente: string;
  sousTotal: number;
  remise: number;
  tva: number;
  total: number;
  statut: string;
  nomClient: string | null;
  notesCaissier: string | null;
  sessionId: string;
  userId: string;
  createdAt: string;
}

export function toVenteDTO(v: Vente): VenteDTO {
  return {
    id: v.id,
    numero: v.numero,
    dateVente: v.dateVente.toISOString(),
    sousTotal: Number(v.sousTotal),
    remise: Number(v.remise),
    tva: Number(v.tva),
    total: Number(v.total),
    statut: v.statut,
    nomClient: v.nomClient,
    notesCaissier: v.notesCaissier,
    sessionId: v.sessionId,
    userId: v.userId,
    createdAt: v.createdAt.toISOString(),
  };
}

// ─── User ─────────────────────────────────────────────

interface UserDTO {
  id: string;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    nom: u.nom,
    email: u.email,
    role: u.role,
    actif: u.actif,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

// ─── Categorie ────────────────────────────────────────

interface CategorieDTO {
  id: string;
  nom: string;
  description: string | null;
  couleur: string | null;
  createdAt: string;
}

export function toCategorieDTO(c: Categorie): CategorieDTO {
  return {
    id: c.id,
    nom: c.nom,
    description: c.description,
    couleur: c.couleur,
    createdAt: c.createdAt.toISOString(),
  };
}

// ─── Ligne de vente (helper) ──────────────────────────

interface LigneVenteDTO {
  id: string;
  quantite: number;
  prixUnitaire: number;
  remise: number;
  tva: number;
  sousTotal: number;
  venteId: string;
  produitId: string;
}

export function toLigneVenteDTO(l: LigneVente): LigneVenteDTO {
  return {
    id: l.id,
    quantite: l.quantite,
    prixUnitaire: Number(l.prixUnitaire),
    remise: Number(l.remise),
    tva: Number(l.tva),
    sousTotal: Number(l.sousTotal),
    venteId: l.venteId,
    produitId: l.produitId,
  };
}

// ─── Paiement (helper) ───────────────────────────────

interface PaiementDTO {
  id: string;
  mode: string;
  montant: number;
  reference: string | null;
  venteId: string;
  createdAt: string;
}

export function toPaiementDTO(p: Paiement): PaiementDTO {
  return {
    id: p.id,
    mode: p.mode,
    montant: Number(p.montant),
    reference: p.reference,
    venteId: p.venteId,
    createdAt: p.createdAt.toISOString(),
  };
}
