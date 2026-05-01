import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// ─── Action catalog (SCREAMING_SNAKE_CASE) ──────────

export const ACTIONS = {
  // Auth
  AUTH_LOGIN_SUCCESS: "AUTH_LOGIN_SUCCESS",
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  AUTH_LOGOUT: "AUTH_LOGOUT",

  // Users
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DEACTIVATED: "USER_DEACTIVATED",

  // Stock — Products
  PRODUCT_CREATED: "PRODUCT_CREATED",
  PRODUCT_UPDATED: "PRODUCT_UPDATED",
  PRODUCT_DEACTIVATED: "PRODUCT_DEACTIVATED",

  // Stock — Categories
  CATEGORY_CREATED: "CATEGORY_CREATED",
  CATEGORY_UPDATED: "CATEGORY_UPDATED",
  CATEGORY_DELETED: "CATEGORY_DELETED",

  // Stock — Movements
  STOCK_MOVEMENT_CREATED: "STOCK_MOVEMENT_CREATED",

  // Comptoir
  COMPTOIR_SESSION_OPENED: "COMPTOIR_SESSION_OPENED",
  COMPTOIR_SESSION_CLOSED: "COMPTOIR_SESSION_CLOSED",
  SALE_COMPLETED: "SALE_COMPLETED",
  SALE_CANCELLED: "SALE_CANCELLED",

  // Tickets / Hardware
  TICKET_PDF_DOWNLOADED: "TICKET_PDF_DOWNLOADED",
  TICKET_THERMAL_PRINT_REQUESTED: "TICKET_THERMAL_PRINT_REQUESTED",
  CASH_DRAWER_OPENED: "CASH_DRAWER_OPENED",
  CASH_DRAWER_OPEN_FAILED: "CASH_DRAWER_OPEN_FAILED",
  BARCODE_SCAN_NOT_FOUND: "BARCODE_SCAN_NOT_FOUND",

  // Parametres
  PARAMETRES_UPDATED: "PARAMETRES_UPDATED",

  // Taxes
  TAXE_CREATED: "TAXE_CREATED",
  TAXE_UPDATED: "TAXE_UPDATED",
  TAXE_DELETED: "TAXE_DELETED",
} as const;

export type ActionCode = (typeof ACTIONS)[keyof typeof ACTIONS];

// ─── logActivity ────────────────────────────────────

interface LogActivityParams {
  action: ActionCode;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: params.action,
        actorId: params.actorId ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata:
          params.metadata === undefined
            ? undefined
            : (params.metadata as Prisma.InputJsonValue),
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent
          ? params.userAgent.slice(0, 512)
          : null,
      },
    });
  } catch (error) {
    // Activity logging must never break the main operation
    console.error("[logActivity]", error);
  }
}

// ─── Request helpers ────────────────────────────────

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}

export function getClientUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}
