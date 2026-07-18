import type { Role } from "@prisma/client";
import { auth } from "@/auth";

// ─── Permission types ────────────────────────────────
// Aligned with SPECS/AUTH.md §3 authorization matrix

export type Permission =
  | "users:manage"
  | "stock:manage"
  | "comptoir:vendre"
  | "comptoir:gerer_session_autre"
  | "comptoir:valider_session"
  | "comptoir:force_close"
  | "comptoir:session_corrective"
  | "comptoir:verifier_integrite"
  | "comptoir:mouvement_manuel"
  | "comptoir:retrait_caisse"
  | "comptoir:depense"
  | "ventes:annuler"
  | "activity_logs:consulter"
  | "rapports:consulter"
  | "parametres:manage";

export const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  ADMIN: new Set([
    "users:manage",
    "stock:manage",
    "comptoir:vendre",
    "comptoir:gerer_session_autre",
    "comptoir:valider_session",
    "comptoir:force_close",
    "comptoir:session_corrective",
    "comptoir:verifier_integrite",
    "comptoir:mouvement_manuel",
    "comptoir:retrait_caisse",
    "comptoir:depense",
    "ventes:annuler",
    "activity_logs:consulter",
    "rapports:consulter",
    "parametres:manage",
  ]),
  MANAGER: new Set([
    "stock:manage",
    "comptoir:vendre",
    "comptoir:gerer_session_autre",
    "comptoir:valider_session",
    "comptoir:verifier_integrite",
    "comptoir:mouvement_manuel",
    "comptoir:retrait_caisse",
    "comptoir:depense",
    "ventes:annuler",
    "activity_logs:consulter",
    "rapports:consulter",
  ]),
  CAISSIER: new Set([
    "comptoir:vendre",
    "comptoir:mouvement_manuel",
  ]),
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
