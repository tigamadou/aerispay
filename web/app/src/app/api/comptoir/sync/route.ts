import { z } from "zod";
import { requireAuth } from "@/lib/permissions";
import { logActivity, ACTIONS, getClientIp, getClientUserAgent } from "@/lib/activity-log";
import { prisma } from "@/lib/db";

const syncOperationSchema = z.object({
  id: z.string().min(1, "Identifiant offline requis"),
  type: z.enum(["VENTE", "MOUVEMENT_MANUEL"]),
  payload: z.record(z.unknown()),
  createdAt: z.string(),
});

const syncRequestSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(50),
});

interface SyncResult {
  operationId: string;
  status: "ok" | "conflict" | "error" | "already_processed";
  error?: string;
}

/**
 * POST — Replay offline operations.
 * Operations are processed sequentially in FIFO order.
 * Each operation is identified by its offline ID for idempotency.
 * Conflicts (stock insufficient, product inactive) are reported but don't stop the queue.
 */
export async function POST(req: Request) {
  const result = await requireAuth();
  if (!result.authenticated) return result.response;

  try {
    const body = await req.json();
    const parsed = syncRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const results: SyncResult[] = [];

    for (const op of parsed.data.operations) {
      try {
        // P1-009: Idempotency check — skip if already processed
        const alreadyProcessed = await checkAlreadyProcessed(op.id, op.type);
        if (alreadyProcessed) {
          results.push({ operationId: op.id, status: "already_processed" });
          continue;
        }

        if (op.type === "VENTE") {
          // Replay sale by calling the ventes API internally
          const saleRes = await fetch(new URL("/api/ventes", req.url).href, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: req.headers.get("cookie") ?? "",
            },
            body: JSON.stringify({ ...op.payload, offlineId: op.id }),
          });

          if (saleRes.ok) {
            results.push({ operationId: op.id, status: "ok" });
          } else {
            const err = await saleRes.json().catch(() => ({ error: "Erreur inconnue" }));
            results.push({
              operationId: op.id,
              status: saleRes.status === 422 ? "conflict" : "error",
              error: err.error ?? "Erreur lors de la synchronisation",
            });
          }
        } else if (op.type === "MOUVEMENT_MANUEL") {
          const mvtRes = await fetch(new URL("/api/comptoir/movements", req.url).href, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: req.headers.get("cookie") ?? "",
            },
            body: JSON.stringify({ ...op.payload, reference: `offline:${op.id}` }),
          });

          if (mvtRes.ok) {
            results.push({ operationId: op.id, status: "ok" });
          } else {
            const err = await mvtRes.json().catch(() => ({ error: "Erreur inconnue" }));
            results.push({
              operationId: op.id,
              status: mvtRes.status === 422 ? "conflict" : "error",
              error: err.error ?? "Erreur lors de la synchronisation",
            });
          }
        }
      } catch (error) {
        results.push({
          operationId: op.id,
          status: "error",
          error: error instanceof Error ? error.message : "Erreur interne",
        });
      }
    }

    const conflicts = results.filter((r) => r.status === "conflict");
    const errors = results.filter((r) => r.status === "error");
    const succeeded = results.filter((r) => r.status === "ok");

    await logActivity({
      action: ACTIONS.CASH_MOVEMENT_CREATED,
      actorId: result.user.id,
      entityType: "Sync",
      metadata: {
        totalOperations: parsed.data.operations.length,
        succeeded: succeeded.length,
        conflicts: conflicts.length,
        errors: errors.length,
      },
      ipAddress: getClientIp(req),
      userAgent: getClientUserAgent(req),
    });

    return Response.json({
      data: {
        results,
        summary: {
          total: results.length,
          succeeded: succeeded.length,
          conflicts: conflicts.length,
          errors: errors.length,
        },
      },
    });
  } catch (error) {
    console.error("[POST /api/comptoir/sync]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * P1-009: Check if an offline operation has already been synced.
 * Uses offlineId field on Vente or reference field on MouvementCaisse.
 */
async function checkAlreadyProcessed(offlineId: string, type: "VENTE" | "MOUVEMENT_MANUEL"): Promise<boolean> {
  if (type === "VENTE") {
    // Check if a sale with this offlineId was already created
    // offlineId is stored in notesCaissier with the prefix "offline:"
    const existing = await prisma.vente.findFirst({
      where: { notesCaissier: { contains: `offline:${offlineId}` } },
      select: { id: true },
    });
    return existing !== null;
  } else {
    // For movements, offlineId is stored in the reference field with prefix "offline:"
    const existing = await prisma.mouvementCaisse.findFirst({
      where: { reference: `offline:${offlineId}` },
      select: { id: true },
    });
    return existing !== null;
  }
}
