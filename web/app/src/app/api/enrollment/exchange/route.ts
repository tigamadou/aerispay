import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeEnrollmentToken } from "@/lib/services/enrollment-token";
import { issueStoreToken } from "@/lib/services/store-token";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

const exchangeSchema = z.object({
  token: z.string().min(1),
  nom: z.string().max(100).optional(),
});

/**
 * Échange d'un code d'enrôlement (single-use) contre un token de magasin (ADR-007).
 * Appelé par le poste à l'install. Auth = le code lui-même. Consomme le code, (re)nomme
 * la caisse pré-créée, émet le token de magasin longue durée.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = exchangeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const consumed = await consumeEnrollmentToken(parsed.data.token);
    if (!consumed.valid || !consumed.caisseId) {
      return Response.json({ error: "Code d'enrôlement invalide ou expiré" }, { status: 401 });
    }

    const caisse = await prisma.caisse.findUnique({
      where: { id: consumed.caisseId },
      select: { id: true, active: true, code: true, nom: true },
    });
    if (!caisse || !caisse.active) {
      return Response.json({ error: "Caisse inactive — contactez l'administrateur" }, { status: 422 });
    }

    let nom = caisse.nom;
    const nouveauNom = parsed.data.nom?.trim();
    if (nouveauNom) {
      const updated = await prisma.caisse.update({
        where: { id: caisse.id },
        data: { nom: nouveauNom },
        select: { id: true, code: true, nom: true },
      });
      nom = updated.nom;
    }

    const { token, id } = await issueStoreToken({ caisseId: caisse.id, label: nom });

    await logActivity({
      action: ACTIONS.POSTE_ENROLLED,
      actorId: null,
      entityType: "Caisse",
      entityId: caisse.id,
      metadata: { storeTokenId: id, codePoste: caisse.code, enrollmentTokenId: consumed.tokenId },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json(
      { data: { storeToken: token, caisseId: caisse.id, codePoste: caisse.code, nom } },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/enrollment/exchange]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
