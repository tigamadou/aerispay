import { requireAuth } from "@/lib/permissions";
import { openCashDrawer } from "@/lib/receipt/thermal-printer";
import { logActivity, ACTIONS } from "@/lib/activity-log";

export async function POST() {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const drawerResult = await openCashDrawer();

    await logActivity({
      action: drawerResult.success ? ACTIONS.CASH_DRAWER_OPENED : ACTIONS.CASH_DRAWER_OPEN_FAILED,
      actorId: result.user.id,
      metadata: { success: drawerResult.success, message: drawerResult.message },
    });

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
