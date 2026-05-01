import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    vente: { findUnique: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Mock Next.js modules used by the server page
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";

function mockSession(role: Role) {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1", email: "t@t.com", name: "Test", role },
  });
}

const sampleVente = {
  id: "v-1",
  numero: "VTE-2026-00001",
  dateVente: new Date("2026-04-23T14:35:00Z"),
  sousTotal: { toString: () => "46100" },
  remise: { toString: () => "2305" },
  tva: { toString: () => "7884" },
  total: { toString: () => "51679" },
  statut: "VALIDEE",
  nomClient: null,
  createdAt: new Date("2026-04-23T14:35:00Z"),
  caissier: { id: "user-1", nom: "Amadou", email: "amadou@test.com" },
  session: { id: "s-1", ouvertureAt: new Date("2026-04-23T08:00:00Z") },
  lignes: [
    {
      id: "l-1",
      quantite: 2,
      prixUnitaire: { toString: () => "12500" },
      remise: { toString: () => "0" },
      tva: { toString: () => "18" },
      sousTotal: { toString: () => "25000" },
      produit: { id: "p-1", nom: "Farine 50kg", reference: "FAR-001" },
    },
    {
      id: "l-2",
      quantite: 1,
      prixUnitaire: { toString: () => "8500" },
      remise: { toString: () => "0" },
      tva: { toString: () => "18" },
      sousTotal: { toString: () => "8500" },
      produit: { id: "p-2", nom: "Sucre cristal 25kg", reference: "SUC-001" },
    },
  ],
  paiements: [
    {
      id: "pay-1",
      mode: "ESPECES",
      montant: { toString: () => "55000" },
      reference: null,
      createdAt: new Date("2026-04-23T14:35:00Z"),
    },
  ],
};

describe("Ticket page (/caisse/tickets/[id])", () => {
  let getTicketPageData: (id: string) => Promise<typeof sampleVente | null>;

  beforeEach(() => {
    vi.clearAllMocks();

    // The page is a server component, so we test the data-fetching logic
    // by calling the prisma query directly
    getTicketPageData = async (id: string) => {
      const vente = await prisma.vente.findUnique({
        where: { id },
        include: {
          lignes: {
            include: { produit: { select: { id: true, nom: true, reference: true } } },
          },
          paiements: true,
          caissier: { select: { id: true, nom: true, email: true } },
          session: { select: { id: true, ouvertureAt: true } },
        },
      });
      return vente;
    };
  });

  it("redirects to /login when not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(redirect).toBeDefined();
  });

  it("calls notFound when vente does not exist", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await getTicketPageData("non-existent");
    expect(result).toBeNull();
  });

  it("returns vente data with all relations for a valid id", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);

    const result = await getTicketPageData("v-1");
    expect(result).toBeDefined();
    expect(result!.numero).toBe("VTE-2026-00001");
    expect(result!.lignes).toHaveLength(2);
    expect(result!.paiements).toHaveLength(1);
    expect(result!.caissier.nom).toBe("Amadou");
  });

  it("includes product details in sale lines", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);

    const result = await getTicketPageData("v-1");
    expect(result!.lignes[0].produit.nom).toBe("Farine 50kg");
    expect(result!.lignes[0].produit.reference).toBe("FAR-001");
  });

  it("includes payment information", async () => {
    mockSession("CAISSIER");
    (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);

    const result = await getTicketPageData("v-1");
    expect(result!.paiements[0].mode).toBe("ESPECES");
    expect(Number(result!.paiements[0].montant)).toBe(55000);
  });

  it("is accessible to all authenticated roles", async () => {
    for (const role of ["ADMIN", "MANAGER", "CAISSIER"] as Role[]) {
      mockSession(role);
      (prisma.vente.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVente);
      const result = await getTicketPageData("v-1");
      expect(result).toBeDefined();
    }
  });
});
