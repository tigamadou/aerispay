import type { Role } from "@prisma/client";
import { auth } from "@/auth";

// ─── Permission types ────────────────────────────────
// Aligned with SPECS/AUTH.md §3 authorization matrix

export type Permission =
  | "users:manage"
  | "stock:manage"
  | "caisse:vendre"
  | "caisse:gerer_session_autre"
  | "ventes:annuler"
  | "activity_logs:consulter"
  | "rapports:consulter"
  | "parametres:manage";

export const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  ADMIN: new Set([
    "users:manage",
    "stock:manage",
    "caisse:vendre",
    "caisse:gerer_session_autre",
    "ventes:annuler",
    "activity_logs:consulter",
    "rapports:consulter",
    "parametres:manage",
  ]),
  MANAGER: new Set([
    "stock:manage",
    "caisse:vendre",
    "caisse:gerer_session_autre",
    "ventes:annuler",
    "activity_logs:consulter",
    "rapports:consulter",
  ]),
  CAISSIER: new Set(["caisse:vendre"]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function hasRole(userRole: Role, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(userRole);
}

// ─── API Route helpers ───────────────────────────────

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

type AuthResult =
  | { authenticated: true; user: AuthenticatedUser }
  | { authenticated: false; response: Response };

export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return {
      authenticated: false,
      response: Response.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }
  return {
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? null,
      role: session.user.role,
    },
  };
}

export async function requireRole(
  ...roles: Role[]
): Promise<AuthResult> {
  const result = await requireAuth();
  if (!result.authenticated) return result;

  if (!hasRole(result.user.role, roles)) {
    return {
      authenticated: false,
      response: Response.json({ error: "Accès refusé" }, { status: 403 }),
    };
  }
  return result;
}
