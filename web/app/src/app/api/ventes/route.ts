import { prisma } from "@/lib/db";
import { requireAuth, hasRole } from "@/lib/permissions";
import { createVenteSchema } from "@/lib/validations/vente";
import { Prisma } from "@prisma/client";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

function genererNumeroVente(sequence: number): string {
  return `VTE-${new Date().getFullYear()}-${String(sequence).padStart(5, "0")}`;
}

export async function GET(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));

  // Filters
  const filterUserId = searchParams.get("userId");
  const filterDateFrom = searchParams.get("dateFrom");
  const filterDateTo = searchParams.get("dateTo");

  // CAISSIER: only own sales. ADMIN/MANAGER: all (with optional filters)
  const where: Prisma.VenteWhereInput = {};

  if (hasRole(result.user.role, ["ADMIN", "MANAGER"])) {
    if (filterUserId) where.userId = filterUserId;
  } else {
    // CAISSIER sees only their own
    where.userId = result.user.id;
  }

  if (filterDateFrom || filterDateTo) {
    where.dateVente = {};
    if (filterDateFrom) where.dateVente.gte = new Date(filterDateFrom);
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      where.dateVente.lte = to;
    }
  }

  try {
    const [ventes, total] = await Promise.all([
      prisma.vente.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { dateVente: "desc" },
        include: {
          caissier: { select: { id: true, nom: true } },
          paiements: { select: { mode: true, montant: true } },
          lignes: { select: { quantite: true, sousTotal: true } },
        },
      }),
      prisma.vente.count({ where }),
    ]);

    return Response.json({ data: ventes, total, page, pageSize });
  } catch (error) {
    console.error("[GET /api/ventes]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = createVenteSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionId, lignes, paiements, remise, nomClient, notesCaissier } = parsed.data;

    // Verify session is open
    const session = await prisma.caisseSession.findUnique({ where: { id: sessionId } });
    if (!session || session.statut !== "OUVERTE") {
      return Response.json(
        { error: "Aucune session de caisse ouverte pour cette ID" },
        { status: 422 }
      );
    }

    // Fetch active taxes from config
    const activeTaxes = await prisma.taxe.findMany({
      where: { active: true, parametresId: "default" },
      orderBy: { ordre: "asc" },
      select: { nom: true, taux: true },
    });

    // Transaction: create sale + lines + payments + decrement stock
    const vente = await prisma.$transaction(async (tx) => {
      // Verify stock and get product data
      const produits = await Promise.all(
        lignes.map(async (l) => {
          const p = await tx.produit.findUnique({ where: { id: l.produitId } });
          if (!p || !p.actif) {
            throw new TxError(`Produit introuvable ou inactif : ${l.produitId}`, 422);
          }
          if (p.stockActuel < l.quantite) {
            throw new TxError(
              `Stock insuffisant pour "${p.nom}" (disponible: ${p.stockActuel}, demandé: ${l.quantite})`,
              422
            );
          }
          return p;
        })
      );

      // Calculate totals
      let sousTotal = new Prisma.Decimal(0);
      const lignesData = lignes.map((l, i) => {
        const p = produits[i];
        const lineSubtotal =
          l.prixUnitaire * l.quantite * (1 - l.remise / 100);
        sousTotal = sousTotal.add(new Prisma.Decimal(lineSubtotal));
        return {
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          remise: l.remise,
          tva: 0,
          sousTotal: lineSubtotal,
          produitId: p.id,
        };
      });

      const montantRemise = new Prisma.Decimal(remise);
      const base = sousTotal.sub(montantRemise);

      // Compute each tax on the base (sous-total - remise)
      const taxesDetail: { nom: string; taux: number; montant: number }[] = [];
      let totalTva = new Prisma.Decimal(0);
      if (base.gt(0)) {
        for (const t of activeTaxes) {
          const montant = base.mul(new Prisma.Decimal(t.taux).div(100));
          taxesDetail.push({ nom: t.nom, taux: Number(t.taux), montant: Number(montant) });
          totalTva = totalTva.add(montant);
        }
      }

      const total = sousTotal.sub(montantRemise).add(totalTva);

      // Check payments cover total
      const totalPaiements = paiements.reduce(
        (sum, p) => sum.add(new Prisma.Decimal(p.montant)),
        new Prisma.Decimal(0)
      );
      if (totalPaiements.lt(total)) {
        throw new TxError(
          `Paiement insuffisant (total: ${total.toFixed(0)}, reçu: ${totalPaiements.toFixed(0)})`,
          422
        );
      }

      // Generate sequential sale number
      const lastVente = await tx.vente.findFirst({
        where: { numero: { startsWith: `VTE-${new Date().getFullYear()}-` } },
        orderBy: { numero: "desc" },
        select: { numero: true },
      });
      const lastSeq = lastVente
        ? parseInt(lastVente.numero.split("-")[2])
        : 0;
      const numero = genererNumeroVente(lastSeq + 1);

      // Create sale
      const newVente = await tx.vente.create({
        data: {
          numero,
          sousTotal,
          remise: montantRemise,
          tva: totalTva,
          taxesDetail: taxesDetail.length > 0 ? taxesDetail : undefined,
          total,
          nomClient: nomClient ?? null,
          notesCaissier: notesCaissier ?? null,
          sessionId,
          userId: result.user.id,
          lignes: { create: lignesData },
          paiements: {
            create: paiements.map((p) => ({
              mode: p.mode,
              montant: p.montant,
              reference: p.reference ?? null,
            })),
          },
        },
        include: {
          lignes: { include: { produit: { select: { nom: true } } } },
          paiements: true,
          caissier: { select: { id: true, nom: true } },
        },
      });

      // Decrement stock + create movements
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        const p = produits[i];

        await tx.produit.update({
          where: { id: p.id },
          data: { stockActuel: { decrement: l.quantite } },
        });

        await tx.mouvementStock.create({
          data: {
            type: "SORTIE",
            quantite: l.quantite,
            quantiteAvant: p.stockActuel,
            quantiteApres: p.stockActuel - l.quantite,
            motif: `Vente ${numero}`,
            produitId: p.id,
            venteId: newVente.id,
          },
        });
      }

      return newVente;
    });

    await logActivity({
      action: ACTIONS.SALE_COMPLETED,
      actorId: result.user.id,
      entityType: "Sale",
      entityId: vente.id,
      metadata: {
        numero: vente.numero,
        total: Number(vente.total),
        sousTotal: Number(vente.sousTotal),
        remise: Number(vente.remise),
        tva: Number(vente.tva),
        sessionId: vente.sessionId,
        paiements: vente.paiements.map((p) => ({ mode: p.mode, montant: Number(p.montant) })),
        nbArticles: vente.lignes.reduce((sum, l) => sum + l.quantite, 0),
        lignes: vente.lignes.map((l) => ({
          produitId: l.produitId,
          produitNom: l.produit.nom,
          quantite: l.quantite,
          prixUnitaire: Number(l.prixUnitaire),
          sousTotal: Number(l.sousTotal),
        })),
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: vente }, { status: 201 });
  } catch (error) {
    if (error instanceof TxError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    // Handle errors thrown inside $transaction (Prisma wraps or re-throws)
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code;
      if (code === "STOCK_INSUFFISANT" || error.message.includes("Stock insuffisant")) {
        return Response.json({ error: error.message }, { status: 422 });
      }
      if (code === "PRODUIT_INTROUVABLE" || error.message.includes("Produit introuvable")) {
        return Response.json({ error: error.message }, { status: 422 });
      }
      if (code === "PAIEMENT_INSUFFISANT" || error.message.includes("Paiement insuffisant")) {
        return Response.json({ error: error.message }, { status: 422 });
      }
    }
    console.error("[POST /api/ventes]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

class TxError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
