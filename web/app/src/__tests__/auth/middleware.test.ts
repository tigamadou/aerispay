import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";

// Unit-test the middleware routing logic independently.
// The actual middleware uses NextAuth's `auth()` wrapper which is hard to unit-test,
// so we test the decision logic directly.

interface MiddlewareInput {
  pathname: string;
  isLoggedIn: boolean;
}

function middlewareLogic({ pathname, isLoggedIn }: MiddlewareInput) {
  const isLogin = pathname === "/login";
  const isApiAuth = pathname.startsWith("/api/auth");

  if (isApiAuth) {
    return { action: "next" };
  }

  if (!isLoggedIn && !isLogin) {
    return { action: "redirect", target: "/login" };
  }

  if (isLoggedIn && isLogin) {
    return { action: "redirect", target: "/" };
  }

  return { action: "next" };
}

describe("Auth — Middleware routing logic", () => {
  describe("unauthenticated user", () => {
    it("redirects to /login when accessing protected page", () => {
      const result = middlewareLogic({
        pathname: "/",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "redirect", target: "/login" });
    });

    it("redirects to /login when accessing /stock", () => {
      const result = middlewareLogic({
        pathname: "/stock",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "redirect", target: "/login" });
    });

    it("redirects to /login when accessing /caisse", () => {
      const result = middlewareLogic({
        pathname: "/caisse",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "redirect", target: "/login" });
    });

    it("redirects to /login when accessing /users", () => {
      const result = middlewareLogic({
        pathname: "/users",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "redirect", target: "/login" });
    });

    it("redirects to /login when accessing /activity-logs", () => {
      const result = middlewareLogic({
        pathname: "/activity-logs",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "redirect", target: "/login" });
    });

    it("allows /login page", () => {
      const result = middlewareLogic({
        pathname: "/login",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "next" });
    });

    it("allows /api/auth/* routes (NextAuth endpoints)", () => {
      const result = middlewareLogic({
        pathname: "/api/auth/callback/credentials",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "next" });
    });

    it("allows /api/auth/signin", () => {
      const result = middlewareLogic({
        pathname: "/api/auth/signin",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "next" });
    });
  });

  describe("authenticated user", () => {
    it("allows access to dashboard", () => {
      const result = middlewareLogic({
        pathname: "/",
        isLoggedIn: true,
      });
      expect(result).toEqual({ action: "next" });
    });

    it("allows access to /stock", () => {
      const result = middlewareLogic({
        pathname: "/stock",
        isLoggedIn: true,
      });
      expect(result).toEqual({ action: "next" });
    });

    it("allows access to /caisse", () => {
      const result = middlewareLogic({
        pathname: "/caisse",
        isLoggedIn: true,
      });
      expect(result).toEqual({ action: "next" });
    });

    it("redirects away from /login to /", () => {
      const result = middlewareLogic({
        pathname: "/login",
        isLoggedIn: true,
      });
      expect(result).toEqual({ action: "redirect", target: "/" });
    });

    it("allows /api/auth/* routes", () => {
      const result = middlewareLogic({
        pathname: "/api/auth/signout",
        isLoggedIn: true,
      });
      expect(result).toEqual({ action: "next" });
    });
  });

  describe("API routes protection", () => {
    it("redirects unauthenticated user from /api/produits", () => {
      const result = middlewareLogic({
        pathname: "/api/produits",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "redirect", target: "/login" });
    });

    it("redirects unauthenticated user from /api/users", () => {
      const result = middlewareLogic({
        pathname: "/api/users",
        isLoggedIn: false,
      });
      expect(result).toEqual({ action: "redirect", target: "/login" });
    });

    it("allows authenticated user to access /api/produits", () => {
      const result = middlewareLogic({
        pathname: "/api/produits",
        isLoggedIn: true,
      });
      expect(result).toEqual({ action: "next" });
    });
  });
});
