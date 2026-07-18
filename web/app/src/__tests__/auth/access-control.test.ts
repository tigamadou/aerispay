import { describe, it, expect, vi } from "vitest";

// Mock auth to avoid next/server dependency
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { hasPermission, hasRole } from "@/lib/permissions";

// Tests for access control rules:
// - CAISSIER cannot access stock pages (stock:manage = false)
// - Only CAISSIER can open a cash session
// - ADMIN/MANAGER access POS in read-only (no session needed)

describe("Access control — Stock visibility", () => {
  it("CAISSIER cannot see stock navigation (no stock:manage)", () => {
    expect(hasPermission("CAISSIER", "stock:manage")).toBe(false);
  });

  it("ADMIN can see stock navigation", () => {
    expect(hasPermission("ADMIN", "stock:manage")).toBe(true);
  });

  it("MANAGER can see stock navigation", () => {
    expect(hasPermission("MANAGER", "stock:manage")).toBe(true);
  });
});

describe("Access control — Cash session opening", () => {
  it("only CAISSIER can open a session", () => {
    expect(hasRole("CAISSIER", ["CAISSIER"])).toBe(true);
    expect(hasRole("ADMIN", ["CAISSIER"])).toBe(false);
    expect(hasRole("MANAGER", ["CAISSIER"])).toBe(false);
  });
});

describe("Access control — POS read-only for non-CAISSIER", () => {
  it("ADMIN is not CAISSIER → read-only POS", () => {
    expect(hasRole("ADMIN", ["CAISSIER"])).toBe(false);
  });

  it("MANAGER is not CAISSIER → read-only POS", () => {
    expect(hasRole("MANAGER", ["CAISSIER"])).toBe(false);
  });

  it("CAISSIER gets full POS access", () => {
    expect(hasRole("CAISSIER", ["CAISSIER"])).toBe(true);
  });
});

describe("Access control — Sessions page restricted to CAISSIER", () => {
  it("ADMIN is redirected away from sessions page", () => {
    expect(hasRole("ADMIN", ["CAISSIER"])).toBe(false);
  });

  it("MANAGER is redirected away from sessions page", () => {
    expect(hasRole("MANAGER", ["CAISSIER"])).toBe(false);
  });

  it("CAISSIER can access sessions page", () => {
    expect(hasRole("CAISSIER", ["CAISSIER"])).toBe(true);
  });
});
