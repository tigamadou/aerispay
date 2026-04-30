import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/permissions";
import { createProductSchema } from "@/lib/validations/produit";
import { genererReference } from "@/lib/utils";

function serializeProduit(p: Record<string, unknown>) {
  return {
    ...p,
    prixAchat: Number(p.prixAchat),
    prixVente: Number(p.prixVente),
    tva: Number(p.tva),
  };
}

export async function GET(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));
  const categorieId = searchParams.get("categorieId");
  const statut = searchParams.get("statut");
  const actif = searchParams.get("actif");
  const recherche = searchParams.get("recherche");
  const tri = searchParams.get("tri") ?? "nom";
  const ordre = searchParams.get("ordre") === "desc" ? "desc" : "asc";

  try {
    const where: Record<string, unknown> = {};

    if (categorieId) where.categorieId = categorieId;

    if (actif !== null && actif !== undefined && actif !== "") {
      where.actif = actif === "true";
    }

    if (recherche) {
      where.OR = [
        { nom: { contains: recherche } },
        { reference: { contains: recherche } },
        { codeBarres: { contains: recherche } },
      ];
    }

    if (statut === "rupture") {
      where.actif = where.actif ?? true;
      where.stockActuel = { lte: prisma.produit.fields?.stockMinimum ?? 0 };
      // Use raw condition for comparing two columns
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { stockActuel: { gt: 0 } },
      ];
      // Simple approach: fetch all and filter, or use raw query
      // For Prisma, we use a simpler approach
      delete where.stockActuel;
      delete where.AND;
    }

    // Build orderBy
    const allowedSorts: Record<string, string> = {
      nom: "nom",
      stock: "stockActuel",
      prix: "prixVente",
      createdAt: "createdAt",
    };
    const orderByField = allowedSorts[tri] ?? "nom";
    const orderBy = { [orderByField]: ordre };

    const [produits, total] = await Promise.all([
      prisma.produit.findMany({
        where,
        include: { categorie: { select: { id: true, nom: true, couleur: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      prisma.produit.count({ where }),
    ]);

    let data = produits.map(serializeProduit);

    // Post-filter for statut (comparing two columns not natively supported in Prisma where)
    if (statut === "rupture") {
      data = data.filter(
        (p) =>
          (p.stockActuel as number) <= (p.stockMinimum as number) &&
          (p.stockActuel as number) > 0
      );
    } else if (statut === "epuise") {
      data = data.filter((p) => (p.stockActuel as number) === 0);
    } else if (statut === "alerte") {
      data = data.filter(
        (p) =>
          (p.stockActuel as number) > (p.stockMinimum as number) &&
          (p.stockActuel as number) <= 2 * (p.stockMinimum as number)
      );
    } else if (statut === "normal") {
      data = data.filter(
        (p) => (p.stockActuel as number) > 2 * (p.stockMinimum as number)
      );
    }

    return Response.json({ data, total, page, pageSize });
  } catch (error) {
    console.error("[GET /api/produits]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check barcode uniqueness if provided
    if (parsed.data.codeBarres) {
      const existing = await prisma.produit.findUnique({
        where: { codeBarres: parsed.data.codeBarres },
      });
      if (existing) {
        return Response.json(
          { error: "Un produit avec ce code-barres existe déjà" },
          { status: 409 }
        );
      }
    }

    // Verify category exists
    const categorie = await prisma.categorie.findUnique({
      where: { id: parsed.data.categorieId },
    });
    if (!categorie) {
      return Response.json(
        { error: "Catégorie introuvable" },
        { status: 400 }
      );
    }

    const reference = parsed.data.reference || genererReference();

    const produit = await prisma.produit.create({
      data: {
        reference,
        codeBarres: parsed.data.codeBarres ?? null,
        nom: parsed.data.nom,
        description: parsed.data.description ?? null,
        prixAchat: parsed.data.prixAchat,
        prixVente: parsed.data.prixVente,
        tva: parsed.data.tva,
        unite: parsed.data.unite,
        stockMinimum: parsed.data.stockMinimum,
        stockMaximum: parsed.data.stockMaximum ?? null,
        categorieId: parsed.data.categorieId,
      },
      include: { categorie: { select: { id: true, nom: true, couleur: true } } },
    });

    return Response.json({ data: serializeProduit(produit) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/produits]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
