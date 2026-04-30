import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { updateUserSchema } from "@/lib/validations/user";
import { hash } from "bcryptjs";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const BCRYPT_ROUNDS = 12;

function sanitizeUser(user: { motDePasse: string; [key: string]: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { motDePasse, ...safe } = user;
  return safe;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }
    return Response.json({ data: sanitizeUser(user) });
  } catch (error) {
    console.error(`[GET /api/users/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.nom !== undefined) updateData.nom = parsed.data.nom;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.actif !== undefined) updateData.actif = parsed.data.actif;
    if (parsed.data.motDePasse !== undefined) {
      updateData.motDePasse = await hash(parsed.data.motDePasse, BCRYPT_ROUNDS);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const action = parsed.data.actif === false && existing.actif
      ? ACTIONS.USER_DEACTIVATED
      : ACTIONS.USER_UPDATED;

    await logActivity({
      action,
      actorId: result.user.id,
      entityType: "User",
      entityId: id,
      metadata: { nom: updated.nom, changes: Object.keys(updateData) },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({ data: sanitizeUser(updated) });
  } catch (error) {
    console.error(`[PUT /api/users/${id}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
