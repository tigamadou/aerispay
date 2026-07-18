import { prisma } from "@/lib/db";

/**
 * C2.3 — Health-check du nœud magasin.
 * Endpoint public léger consommé par le client Electron pour décider d'afficher
 * l'écran de blocage si le nœud est indisponible (ADR-001 : pas de mode dégradé).
 */
export async function GET(): Promise<Response> {
  try {
    // Vérifie la connectivité base sans charger de données métier.
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: true });
  } catch (error) {
    console.error("[GET /api/health]", error);
    return Response.json({ status: "unavailable", db: false }, { status: 503 });
  }
}
