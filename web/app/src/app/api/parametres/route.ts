import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { parametresSchema } from "@/lib/validations/parametres";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const DEFAULT_PARAMETRES = {
  id: "default",
  nomCommerce: "",
  adresse: "",
  telephone: "",
  email: "",
  rccm: "",
  nif: "",
  logo: null as string | null,
};

export async function GET(_req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const parametres = await prisma.parametres.findUnique({
      where: { id: "default" },
    });

    return Response.json({ data: parametres ?? DEFAULT_PARAMETRES });
  } catch (error) {
    console.error("[GET /api/parametres]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = parametresSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Donnees invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const parametres = await prisma.parametres.upsert({
      where: { id: "default" },
      update: parsed.data,
      create: { id: "default", ...parsed.data },
    });

    await logActivity({
      action: ACTIONS.PARAMETRES_UPDATED,
      actorId: result.user.id,
      entityType: "Parametres",
      entityId: "default",
      metadata: { ...parsed.data, logo: parsed.data.logo ? "(logo updated)" : undefined },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: parametres, message: "Parametres mis a jour" });
  } catch (error) {
    console.error("[PUT /api/parametres]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
