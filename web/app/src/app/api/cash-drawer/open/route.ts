import { requireAuth } from "@/lib/permissions";
import { openCashDrawer } from "@/lib/receipt/thermal-printer";

export async function POST() {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const drawerResult = await openCashDrawer();

    if (!drawerResult.success) {
      return Response.json(
        { success: false, error: drawerResult.message },
        { status: 503 }
      );
    }

    return Response.json({ success: true, message: drawerResult.message });
  } catch (error) {
    console.error("[POST /api/cash-drawer/open]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
