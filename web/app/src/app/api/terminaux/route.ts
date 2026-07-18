import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, hasPermission, requireRole } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { computeSoldeCaisseParMode } from "@/lib/services/cash-movement";

const caisseSchema = z.object({
  code: z.string().min(1).max(20),
  nom: z.string().min(1).max(100),
  active: z.boolean().optional(),
});

export async function GET(req: Request): Promise<Response> {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;
  if (!hasPermission(result.user.role, "rapports:consulter")) {
    return Response.json({ error: "Acces refuse" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const withState = url.searchParams.get("state") === "1";

    const terminaux = await prisma.terminalCaisse.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { createdAt: "asc" },
    });

    if (!withState) {
      return Response.json({ data: terminaux });
    }

    const data = await Promise.all(
      terminaux.map(async (t) => {
        const session = await prisma.comptoirSession.findFirst({
          where: { terminalId: t.id, statut: "OUVERTE" },
          select: { id: true, ouvertureAt: true, user: { select: { nom: true } } },
        });
        const soldes = await computeSoldeCaisseParMode(t.id);
        const especes = soldes.find((s) => s.mode === "ESPECES")?.solde ?? 0;
        return {
          id: t.id,
          code: t.code,
          nom: t.nom,
          active: t.active,
          createdAt: t.createdAt,
          sessionOuverte: session
            ? { id: session.id, caissier: session.user.nom, ouvertureAt: session.ouvertureAt }
            : null,
          soldeEspeces: especes,
        };
      }),
    );

    return Response.json({ data });
  } catch (error) {
    console.error("[GET /api/terminaux]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = caisseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const caisse = await prisma.terminalCaisse.create({
      data: { code: parsed.data.code, nom: parsed.data.nom, active: parsed.data.active ?? true },
    });

    await logActivity({
      action: ACTIONS.TERMINAL_CREATED,
      actorId: result.user.id,
      entityType: "TerminalCaisse",
      entityId: caisse.id,
      metadata: { nom: caisse.nom },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: caisse }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/terminaux]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
