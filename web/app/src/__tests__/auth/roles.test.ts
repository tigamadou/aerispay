import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";

// Role-based access control logic — tested before implementation.
// Matches the authorization matrix from SPECS/AUTH.md §3.

type Permission =
  | "users:manage"
  | "stock:manage"
  | "comptoir:vendre"
  | "comptoir:gerer_session_autre"
  | "ventes:annuler"
  | "activity_logs:consulter"
  | "rapports:consulter"
  | "parametres:manage";

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  ADMIN: new Set([
    "users:manage",
    "stock:manage",
    "comptoir:vendre",
    "comptoir:gerer_session_autre",
    "ventes:annuler",
    "activity_logs:consulter",
    "rapports:consulter",
    "parametres:manage",
  ]),
  MANAGER: new Set([
    "stock:manage",
    "comptoir:vendre",
    "comptoir:gerer_session_autre",
    "ventes:annuler",
    "activity_logs:consulter",
    "rapports:consulter",
  ]),
  CAISSIER: new Set(["comptoir:vendre"]),
};

function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

function hasRole(userRole: Role, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(userRole);
}

describe("Auth — Role permissions (AUTH.md §3 matrix)", () => {
  describe("ADMIN", () => {
    it("can manage users", () => {
      expect(hasPermission("ADMIN", "users:manage")).toBe(true);
    });

    it("can manage stock", () => {
      expect(hasPermission("ADMIN", "stock:manage")).toBe(true);
    });

    it("can sell", () => {
      expect(hasPermission("ADMIN", "comptoir:vendre")).toBe(true);
    });

    it("can manage other operator sessions", () => {
      expect(hasPermission("ADMIN", "comptoir:gerer_session_autre")).toBe(true);
    });

    it("can cancel sales", () => {
      expect(hasPermission("ADMIN", "ventes:annuler")).toBe(true);
    });

    it("can view activity logs", () => {
      expect(hasPermission("ADMIN", "activity_logs:consulter")).toBe(true);
    });

    it("can view reports", () => {
      expect(hasPermission("ADMIN", "rapports:consulter")).toBe(true);
    });

    it("can manage settings", () => {
      expect(hasPermission("ADMIN", "parametres:manage")).toBe(true);
    });
  });

  describe("MANAGER", () => {
    it("cannot manage users", () => {
      expect(hasPermission("MANAGER", "users:manage")).toBe(false);
    });

    it("can manage stock", () => {
      expect(hasPermission("MANAGER", "stock:manage")).toBe(true);
    });

    it("can sell", () => {
      expect(hasPermission("MANAGER", "comptoir:vendre")).toBe(true);
    });

    it("can manage other operator sessions", () => {
      expect(hasPermission("MANAGER", "comptoir:gerer_session_autre")).toBe(true);
    });

    it("can cancel sales", () => {
      expect(hasPermission("MANAGER", "ventes:annuler")).toBe(true);
    });

    it("can view activity logs", () => {
      expect(hasPermission("MANAGER", "activity_logs:consulter")).toBe(true);
    });

    it("can view reports", () => {
      expect(hasPermission("MANAGER", "rapports:consulter")).toBe(true);
    });

    it("cannot manage settings", () => {
      expect(hasPermission("MANAGER", "parametres:manage")).toBe(false);
    });
  });

  describe("CAISSIER", () => {
    it("cannot manage users", () => {
      expect(hasPermission("CAISSIER", "users:manage")).toBe(false);
    });

    it("cannot manage stock", () => {
      expect(hasPermission("CAISSIER", "stock:manage")).toBe(false);
    });

    it("can sell", () => {
      expect(hasPermission("CAISSIER", "comptoir:vendre")).toBe(true);
    });

    it("cannot manage other operator sessions", () => {
      expect(hasPermission("CAISSIER", "comptoir:gerer_session_autre")).toBe(
        false
      );
    });

    it("cannot cancel sales", () => {
      expect(hasPermission("CAISSIER", "ventes:annuler")).toBe(false);
    });

    it("cannot view activity logs", () => {
      expect(hasPermission("CAISSIER", "activity_logs:consulter")).toBe(false);
    });

    it("cannot view reports", () => {
      expect(hasPermission("CAISSIER", "rapports:consulter")).toBe(false);
    });

    it("cannot manage settings", () => {
      expect(hasPermission("CAISSIER", "parametres:manage")).toBe(false);
    });
  });
});

describe("Auth — hasRole helper", () => {
  it("ADMIN matches [ADMIN]", () => {
    expect(hasRole("ADMIN", ["ADMIN"])).toBe(true);
  });

  it("ADMIN matches [ADMIN, MANAGER]", () => {
    expect(hasRole("ADMIN", ["ADMIN", "MANAGER"])).toBe(true);
  });

  it("CAISSIER does not match [ADMIN]", () => {
    expect(hasRole("CAISSIER", ["ADMIN"])).toBe(false);
  });

  it("CAISSIER does not match [ADMIN, MANAGER]", () => {
    expect(hasRole("CAISSIER", ["ADMIN", "MANAGER"])).toBe(false);
  });

  it("MANAGER matches [ADMIN, MANAGER]", () => {
    expect(hasRole("MANAGER", ["ADMIN", "MANAGER"])).toBe(true);
  });

  it("MANAGER does not match [ADMIN]", () => {
    expect(hasRole("MANAGER", ["ADMIN"])).toBe(false);
  });
});
