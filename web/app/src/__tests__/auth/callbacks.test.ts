import { describe, it, expect } from "vitest";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";

// Replicate callback logic from src/auth.ts to unit-test independently of NextAuth internals.

async function jwtCallback({
  token,
  user,
}: {
  token: JWT;
  user?: User;
}): Promise<JWT> {
  if (user) {
    token.id = user.id as string;
    token.role = user.role;
    token.email = user.email ?? undefined;
    token.name = user.name ?? undefined;
  }
  return token;
}

async function sessionCallback({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Promise<Session> {
  if (session.user) {
    session.user.id = token.id as string;
    session.user.role = token.role;
    session.user.email = (token.email as string) ?? session.user.email ?? "";
    session.user.name = (token.name as string) ?? session.user.name ?? null;
  }
  return session;
}

describe("Auth — JWT callback", () => {
  it("enriches token with user data on first sign-in", async () => {
    const token: JWT = { sub: "sub-1" } as JWT;
    const user: User = {
      id: "user-1",
      name: "Admin",
      email: "admin@aerispay.com",
      role: "ADMIN",
    };

    const result = await jwtCallback({ token, user });

    expect(result.id).toBe("user-1");
    expect(result.role).toBe("ADMIN");
    expect(result.email).toBe("admin@aerispay.com");
    expect(result.name).toBe("Admin");
  });

  it("preserves existing token on subsequent requests (no user)", async () => {
    const token: JWT = {
      sub: "sub-1",
      id: "user-1",
      role: "ADMIN",
      email: "admin@aerispay.com",
      name: "Admin",
    } as JWT;

    const result = await jwtCallback({ token });

    expect(result.id).toBe("user-1");
    expect(result.role).toBe("ADMIN");
  });

  it("handles CAISSIER role in token", async () => {
    const token: JWT = { sub: "sub-2" } as JWT;
    const user: User = {
      id: "user-2",
      name: "Caissier",
      email: "caissier@aerispay.com",
      role: "CAISSIER",
    };

    const result = await jwtCallback({ token, user });

    expect(result.role).toBe("CAISSIER");
  });

  it("handles user with no email gracefully", async () => {
    const token: JWT = { sub: "sub-3" } as JWT;
    const user: User = {
      id: "user-3",
      name: "NoEmail",
      email: null,
      role: "MANAGER",
    };

    const result = await jwtCallback({ token, user });

    expect(result.email).toBeUndefined();
    expect(result.name).toBe("NoEmail");
    expect(result.role).toBe("MANAGER");
  });
});

describe("Auth — Session callback", () => {
  it("populates session.user from JWT token", async () => {
    const session: Session = {
      user: { id: "", role: "CAISSIER", email: "", name: null },
      expires: new Date().toISOString(),
    };
    const token: JWT = {
      sub: "sub-1",
      id: "user-1",
      role: "ADMIN",
      email: "admin@aerispay.com",
      name: "Admin",
    } as JWT;

    const result = await sessionCallback({ session, token });

    expect(result.user.id).toBe("user-1");
    expect(result.user.role).toBe("ADMIN");
    expect(result.user.email).toBe("admin@aerispay.com");
    expect(result.user.name).toBe("Admin");
  });

  it("falls back to session email when token email is missing", async () => {
    const session: Session = {
      user: {
        id: "",
        role: "CAISSIER",
        email: "fallback@test.com",
        name: null,
      },
      expires: new Date().toISOString(),
    };
    const token: JWT = {
      sub: "sub-1",
      id: "user-1",
      role: "MANAGER",
    } as JWT;

    const result = await sessionCallback({ session, token });

    expect(result.user.email).toBe("fallback@test.com");
    expect(result.user.role).toBe("MANAGER");
  });

  it("sets name to null when token name is missing", async () => {
    const session: Session = {
      user: { id: "", role: "CAISSIER", email: "", name: null },
      expires: new Date().toISOString(),
    };
    const token: JWT = {
      sub: "sub-1",
      id: "user-1",
      role: "CAISSIER",
      email: "caissier@test.com",
    } as JWT;

    const result = await sessionCallback({ session, token });

    expect(result.user.name).toBeNull();
  });
});
