import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { printReceipt } from "@/lib/receipt/thermal-printer";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { id } = await params;

  try {
    const vente = await prisma.vente.findUnique({ where: { id } });
    if (!vente) {
      return Response.json({ error: "Vente introuvable" }, { status: 404 });
    }

    const printResult = await printReceipt(id);

    if (!printResult.success) {
      return Response.json(
        { success: false, error: printResult.message },
        { status: 503 }
      );
    }

    return Response.json({ success: true, message: printResult.message });
  } catch (error) {
    console.error(`[POST /api/tickets/${id}/print]`, error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
