import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { createUserSchema } from "@/lib/validations/user";
import { hash } from "bcryptjs";

const BCRYPT_ROUNDS = 12;

function sanitizeUser(user: { motDePasse: string; [key: string]: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { motDePasse, ...safe } = user;
  return safe;
}

export async function GET(req: Request) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count(),
    ]);

    return Response.json({
      data: users.map(sanitizeUser),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("[GET /api/users]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("ADMIN");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return Response.json(
        { error: "Un utilisateur avec cet email existe déjà" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(parsed.data.motDePasse, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        nom: parsed.data.nom,
        email: parsed.data.email,
        motDePasse: hashedPassword,
        role: parsed.data.role,
      },
    });

    return Response.json({ data: sanitizeUser(user) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/users]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
