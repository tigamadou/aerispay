import { describe, it, expect, vi, beforeEach } from "vitest";
import { compare } from "bcryptjs";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  compare: vi.fn(),
}));

// Mock Prisma
const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// We extract the authorize logic to test it directly,
// since NextAuth wraps it. We replicate the authorize function from src/auth.ts.
async function authorize(credentials: Record<string, unknown> | undefined) {
  const email = credentials?.email;
  const password = credentials?.password;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    return null;
  }

  const user = await mockFindUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !user.actif) {
    return null;
  }

  const valid = await compare(password, user.motDePasse);
  if (!valid) {
    return null;
  }

  return {
    id: user.id,
    name: user.nom,
    email: user.email,
    role: user.role,
  };
}

const MOCK_USER = {
  id: "user-1",
  nom: "Admin Test",
  email: "admin@aerispay.com",
  motDePasse: "$2a$12$hashedpassword",
  role: "ADMIN" as const,
  actif: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Auth — authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user object on valid credentials", async () => {
    mockFindUnique.mockResolvedValue(MOCK_USER);
    vi.mocked(compare).mockResolvedValue(true as never);

    const result = await authorize({
      email: "admin@aerispay.com",
      password: "Admin@1234",
    });

    expect(result).toEqual({
      id: "user-1",
      name: "Admin Test",
      email: "admin@aerispay.com",
      role: "ADMIN",
    });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "admin@aerispay.com" },
    });
  });

  it("trims and lowercases email before lookup", async () => {
    mockFindUnique.mockResolvedValue(MOCK_USER);
    vi.mocked(compare).mockResolvedValue(true as never);

    await authorize({
      email: "  Admin@AerisPay.COM  ",
      password: "Admin@1234",
    });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "admin@aerispay.com" },
    });
  });

  it("returns null when user is not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await authorize({
      email: "unknown@test.com",
      password: "whatever",
    });

    expect(result).toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });

  it("returns null when user is inactive (actif=false)", async () => {
    mockFindUnique.mockResolvedValue({ ...MOCK_USER, actif: false });

    const result = await authorize({
      email: "admin@aerispay.com",
      password: "Admin@1234",
    });

    expect(result).toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });

  it("returns null on wrong password", async () => {
    mockFindUnique.mockResolvedValue(MOCK_USER);
    vi.mocked(compare).mockResolvedValue(false as never);

    const result = await authorize({
      email: "admin@aerispay.com",
      password: "wrong-password",
    });

    expect(result).toBeNull();
  });

  it("returns null when email is missing", async () => {
    const result = await authorize({ password: "Admin@1234" });
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when password is missing", async () => {
    const result = await authorize({ email: "admin@aerispay.com" });
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when credentials are undefined", async () => {
    const result = await authorize(undefined);
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when email is empty string", async () => {
    const result = await authorize({ email: "", password: "Admin@1234" });
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when password is empty string", async () => {
    const result = await authorize({
      email: "admin@aerispay.com",
      password: "",
    });
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns correct role for CAISSIER user", async () => {
    const caissier = {
      ...MOCK_USER,
      id: "user-2",
      nom: "Caissier Test",
      email: "caissier@aerispay.com",
      role: "CAISSIER" as const,
    };
    mockFindUnique.mockResolvedValue(caissier);
    vi.mocked(compare).mockResolvedValue(true as never);

    const result = await authorize({
      email: "caissier@aerispay.com",
      password: "password",
    });

    expect(result).toEqual({
      id: "user-2",
      name: "Caissier Test",
      email: "caissier@aerispay.com",
      role: "CAISSIER",
    });
  });

  it("returns correct role for MANAGER user", async () => {
    const manager = {
      ...MOCK_USER,
      id: "user-3",
      nom: "Manager Test",
      email: "manager@aerispay.com",
      role: "MANAGER" as const,
    };
    mockFindUnique.mockResolvedValue(manager);
    vi.mocked(compare).mockResolvedValue(true as never);

    const result = await authorize({
      email: "manager@aerispay.com",
      password: "password",
    });

    expect(result).toEqual({
      id: "user-3",
      name: "Manager Test",
      email: "manager@aerispay.com",
      role: "MANAGER",
    });
  });
});
