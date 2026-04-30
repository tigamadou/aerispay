import { requireRole } from "@/lib/permissions";
import { uploadFile, deleteFile, keyFromUrl } from "@/lib/s3";
import { randomUUID } from "crypto";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function POST(req: Request) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "Fichier requis" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json(
        { error: "Type de fichier non autorisé (JPEG, PNG, WebP, AVIF)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: "Fichier trop volumineux (max 5 Mo)" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const key = `public/produits/${randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadFile(buffer, key, file.type);

    return Response.json({ data: { url, key } }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/upload]", error);
    return Response.json({ error: "Erreur lors de l'upload" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const result = await requireRole("ADMIN", "MANAGER");
  if (!result.authenticated) return result.response;

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return Response.json({ error: "URL requise" }, { status: 400 });
    }

    const key = keyFromUrl(url);
    if (!key) {
      return Response.json({ error: "URL invalide" }, { status: 400 });
    }

    await deleteFile(key);
    return Response.json({ message: "Fichier supprimé" });
  } catch (error) {
    console.error("[DELETE /api/upload]", error);
    return Response.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
