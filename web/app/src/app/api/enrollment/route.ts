import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { issueStoreToken } from "@/lib/services/store-token";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const enrollSchema = z.object({
  caisseId: z.string().min(1),
  label: z.string().max(100).optional(),
});

/**
 * E3.1 — Enrôlement d'un poste (mode « client », ADR-001 : pas d'autonome).
 * Un ADMIN associe une caisse à un poste : le nœud émet un token de magasin scoppé à
 * cette caisse (caisseId = identité du poste, fixée à l'enrôlement). Le token en clair
 * n'est renvoyé qu'une fois — à stocker dans le trousseau OS du poste (E3.2).
 */
export async function POST(req: Request): Promise<Response> {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const parsed = enrollSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const caisse = await prisma.caisse.findUnique({
      where: { id: parsed.data.caisseId },
      select: { id: true, active: true, code: true },
    });
    if (!caisse || !caisse.active) {
      return Response.json({ error: "Caisse introuvable ou inactive" }, { status: 422 });
    }

    const { token, id } = await issueStoreToken({
      caisseId: caisse.id,
      label: parsed.data.label,
    });

    await logActivity({
      action: ACTIONS.POSTE_ENROLLED,
      actorId: result.user.id,
      entityType: "Caisse",
      entityId: caisse.id,
      metadata: { tokenId: id, codePoste: caisse.code, label: parsed.data.label },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json(
      { data: { token, tokenId: id, caisseId: caisse.id, codePoste: caisse.code } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/enrollment]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
