import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { z } from "zod";

const createModeSchema = z.object({
  code: z
    .string()
    .min(1, "Le code est requis")
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Le code doit etre en MAJUSCULES_AVEC_UNDERSCORES"),
  label: z.string().min(1, "Le label est requis").max(100),
  ordre: z.number().int().min(0).optional(),
});

export async function GET(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const url = new URL(req.url);
    const all = url.searchParams.get("all") === "true";

    const modes = await prisma.modePaiementConfig.findMany({
      where: all ? {} : { active: true },
      orderBy: { ordre: "asc" },
    });

    return Response.json({ data: modes });
  } catch (error) {
    console.error("[GET /api/parametres/modes-paiement]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = createModeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Donnees invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { code, label, ordre } = parsed.data;

    // Check uniqueness
    const existing = await prisma.modePaiementConfig.findUnique({ where: { code } });
    if (existing) {
      return Response.json({ error: `Le code "${code}" existe deja` }, { status: 409 });
    }

    const mode = await prisma.modePaiementConfig.create({
      data: {
        code,
        label,
        ordre: ordre ?? 0,
        active: true,
        parametresId: "default",
      },
    });

    await logActivity({
      action: ACTIONS.MODE_PAIEMENT_CREATED,
      actorId: result.user.id,
      entityType: "ModePaiementConfig",
      entityId: mode.id,
      metadata: { code, label },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: mode }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/parametres/modes-paiement]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
