import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, hasRole } from "@/lib/permissions";
import { declarationCloturSchema } from "@/lib/validations/mouvement-caisse";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeTheoriqueParMode } from "@/lib/services/cash-movement";

/**
 * POST — RULE-CLOSE-001 + RULE-CLOSE-002
 * Étape 1 : le caissier soumet ses déclarations de montants physiques par mode.
 * Étape 2 : le serveur calcule les soldes théoriques et les écarts préliminaires.
 * Transition : STATE-OPEN → STATE-PENDING_CLOSURE → STATE-PENDING_VALIDATION (automatique)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      select: { id: true, statut: true, userId: true },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    if (session.statut !== "OUVERTE") {
      return Response.json(
        { error: "La session doit être ouverte pour demander la clôture" },
        { status: 422 },
      );
    }

    // Only the session owner can request closure (or ADMIN/MANAGER for their own)
    if (session.userId !== result.user.id && !hasRole(result.user.role, ["ADMIN", "MANAGER"])) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = declarationCloturSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // RULE-CLOSE-002: compute theoretical balances from movements
    const soldesParMode = await computeSoldeTheoriqueParMode(id);
    const soldesMap = new Map<string, number>();
    for (const s of soldesParMode) {
      soldesMap.set(s.mode, s.solde);
    }

    // Compute preliminary discrepancies
    const ecartsParMode: Record<string, { theorique: number; declare: number; ecart: number }> = {};
    const declarations = parsed.data.declarations as Record<string, number>;

    // Include all modes that have movements OR declarations
    const allModes = new Set([
      ...soldesMap.keys(),
      ...Object.keys(declarations),
    ]);

    for (const mode of allModes) {
      const theorique = soldesMap.get(mode) ?? 0;
      const declare = declarations[mode] ?? 0;
      ecartsParMode[mode] = {
        theorique,
        declare,
        ecart: declare - theorique,
      };
    }

    // Compute legacy cash/mobileMoney totals for backward compat
    let soldeTheoriqueCash = 0;
    let soldeTheoriqueMobileMoney = 0;
    for (const s of soldesParMode) {
      if (s.mode === "ESPECES") {
        soldeTheoriqueCash = s.solde;
      } else {
        soldeTheoriqueMobileMoney += s.solde;
      }
    }

    // Transition directly to EN_ATTENTE_VALIDATION (étapes 1+2 combinées)
    const updated = await prisma.comptoirSession.update({
      where: { id },
      data: {
        statut: "EN_ATTENTE_VALIDATION",
        declarationsCaissier: declarations,
        demandeCloturAt: new Date(),
        ecartsParMode,
        soldeTheoriqueCash,
        soldeTheoriqueMobileMoney,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    await logActivity({
      action: ACTIONS.SESSION_CLOSURE_REQUESTED,
      actorId: result.user.id,
      entityType: "ComptoirSession",
      entityId: id,
      metadata: {
        declarations,
        soldesParMode: Object.fromEntries(soldesMap),
        ecartsParMode,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({
      data: {
        ...updated,
        soldesParMode: soldesParMode.map((s) => ({ mode: s.mode, solde: s.solde })),
        ecartsParMode,
      },
    });
  } catch (error) {
    console.error(`[POST /api/comptoir/sessions/${id}/closure]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * DELETE — ACT-CANCEL-CLOSURE
 * Le caissier annule sa demande de clôture.
 * Transition : STATE-PENDING_CLOSURE | STATE-EN_ATTENTE_VALIDATION → STATE-OPEN
 * (Only if no blind validation has been submitted yet)
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const session = await prisma.comptoirSession.findUnique({
      where: { id },
      select: { id: true, statut: true, userId: true, declarationsValideur: true },
    });

    if (!session) {
      return Response.json({ error: "Session introuvable" }, { status: 404 });
    }

    // Can only cancel from PENDING_CLOSURE or PENDING_VALIDATION (before blind validation)
    if (session.statut !== "EN_ATTENTE_CLOTURE" && session.statut !== "EN_ATTENTE_VALIDATION") {
      return Response.json(
        { error: "La session n'est pas en attente de clôture" },
        { status: 422 },
      );
    }

    // If a blind validation has already been submitted, cannot cancel
    if (session.declarationsValideur) {
      return Response.json(
        { error: "La validation à l'aveugle a déjà été soumise, annulation impossible" },
        { status: 422 },
      );
    }

    // Only session owner (or ADMIN/MANAGER who owns the session) can cancel
    if (session.userId !== result.user.id && !hasRole(result.user.role, ["ADMIN", "MANAGER"])) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    const updated = await prisma.comptoirSession.update({
      where: { id },
      data: {
        statut: "OUVERTE",
        declarationsCaissier: Prisma.DbNull,
        demandeCloturAt: null,
        ecartsParMode: Prisma.DbNull,
        soldeTheoriqueCash: null,
        soldeTheoriqueMobileMoney: null,
      },
      include: { user: { select: { id: true, nom: true, email: true } } },
    });

    return Response.json({ data: updated });
  } catch (error) {
    console.error(`[DELETE /api/comptoir/sessions/${id}/closure]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
