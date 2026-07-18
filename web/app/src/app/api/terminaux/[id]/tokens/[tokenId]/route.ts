import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { revokeStoreToken } from "@/lib/services/store-token";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; tokenId: string }> },
): Promise<Response> {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { id, tokenId } = await params;
  try {
    const token = await prisma.storeToken.findUnique({ where: { id: tokenId } });
    if (!token || token.terminalId !== id) {
      return Response.json({ error: "Jeton introuvable" }, { status: 404 });
    }
    await revokeStoreToken(tokenId);
    await logActivity({
      action: ACTIONS.STORE_TOKEN_REVOKED,
      actorId: result.user.id,
      entityType: "StoreToken",
      entityId: tokenId,
      metadata: { terminalId: id },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });
    return Response.json({ data: { id: tokenId } });
  } catch (error) {
    console.error(`[DELETE /api/terminaux/${id}/tokens/${tokenId}]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
