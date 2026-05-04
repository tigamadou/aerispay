import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";

// Mirrored from lib/permissions.ts to avoid importing auth (NextAuth side-effect).
// These tests verify the permission matrix matches SPEC_MODULE_CAISSE.md §9.

type Permission =
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

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
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

function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

describe("Permissions module caisse (SPEC_MODULE_CAISSE.md §9)", () => {
  describe("ADMIN", () => {
    it("has comptoir:valider_session", () => {
      expect(hasPermission("ADMIN", "comptoir:valider_session")).toBe(true);
    });
    it("has comptoir:force_close", () => {
      expect(hasPermission("ADMIN", "comptoir:force_close")).toBe(true);
    });
    it("has comptoir:session_corrective", () => {
      expect(hasPermission("ADMIN", "comptoir:session_corrective")).toBe(true);
    });
    it("has comptoir:verifier_integrite", () => {
      expect(hasPermission("ADMIN", "comptoir:verifier_integrite")).toBe(true);
    });
    it("has comptoir:mouvement_manuel", () => {
      expect(hasPermission("ADMIN", "comptoir:mouvement_manuel")).toBe(true);
    });
    it("has comptoir:retrait_caisse", () => {
      expect(hasPermission("ADMIN", "comptoir:retrait_caisse")).toBe(true);
    });
    it("has comptoir:depense", () => {
      expect(hasPermission("ADMIN", "comptoir:depense")).toBe(true);
    });
  });

  describe("MANAGER", () => {
    it("has comptoir:valider_session", () => {
      expect(hasPermission("MANAGER", "comptoir:valider_session")).toBe(true);
    });
    it("does NOT have comptoir:force_close", () => {
      expect(hasPermission("MANAGER", "comptoir:force_close")).toBe(false);
    });
    it("does NOT have comptoir:session_corrective", () => {
      expect(hasPermission("MANAGER", "comptoir:session_corrective")).toBe(false);
    });
    it("has comptoir:verifier_integrite", () => {
      expect(hasPermission("MANAGER", "comptoir:verifier_integrite")).toBe(true);
    });
    it("has comptoir:mouvement_manuel", () => {
      expect(hasPermission("MANAGER", "comptoir:mouvement_manuel")).toBe(true);
    });
    it("has comptoir:retrait_caisse", () => {
      expect(hasPermission("MANAGER", "comptoir:retrait_caisse")).toBe(true);
    });
    it("has comptoir:depense", () => {
      expect(hasPermission("MANAGER", "comptoir:depense")).toBe(true);
    });
  });

  describe("CAISSIER", () => {
    it("does NOT have comptoir:valider_session", () => {
      expect(hasPermission("CAISSIER", "comptoir:valider_session")).toBe(false);
    });
    it("does NOT have comptoir:force_close", () => {
      expect(hasPermission("CAISSIER", "comptoir:force_close")).toBe(false);
    });
    it("does NOT have comptoir:session_corrective", () => {
      expect(hasPermission("CAISSIER", "comptoir:session_corrective")).toBe(false);
    });
    it("does NOT have comptoir:verifier_integrite", () => {
      expect(hasPermission("CAISSIER", "comptoir:verifier_integrite")).toBe(false);
    });
    it("has comptoir:mouvement_manuel", () => {
      expect(hasPermission("CAISSIER", "comptoir:mouvement_manuel")).toBe(true);
    });
    it("does NOT have comptoir:retrait_caisse", () => {
      expect(hasPermission("CAISSIER", "comptoir:retrait_caisse")).toBe(false);
    });
    it("does NOT have comptoir:depense", () => {
      expect(hasPermission("CAISSIER", "comptoir:depense")).toBe(false);
    });
  });
});
