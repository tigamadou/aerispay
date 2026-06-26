import { listUnconsumedEvents, markEventsConsumed } from "@/lib/services/event-emitter";

/**
 * S4 — Synchronisation magasin ↔ cloud (doc `05-synchronisation-cloud.md`).
 *
 * Le transport est un PORT injectable : l'implémentation réelle (HTTPS vers le cloud,
 * mTLS, etc.) vit hors de cette logique métier, ce qui rend le worker entièrement
 * testable. Le nœud magasin pousse les événements outbox (`EventCaisse`) au cloud puis
 * tire la référence descendante depuis un curseur.
 */

export interface OutboxEvent {
  id: string;
  type: string;
  sessionId: string | null;
  payload: unknown;
  consumed: boolean;
  createdAt: Date;
}

export interface ReferenceUpdate {
  entity: string;
  data: unknown;
}

export interface CloudSyncTransport {
  /** Pousse un lot d'événements ; renvoie les ids accusés (idempotent côté cloud). */
  pushEvents(events: OutboxEvent[]): Promise<{ ackedIds: string[] }>;
  /** Tire les mises à jour de référence depuis un curseur (référence descendante). */
  pullReference?(cursor: string | null): Promise<{ updates: ReferenceUpdate[]; nextCursor: string | null }>;
}

export interface PushOptions {
  batchSize?: number;
  /** Garde-fou anti-boucle : nombre maximum de lots par exécution. */
  maxBatches?: number;
}

export interface PushResult {
  pushed: number;
  acked: number;
  batches: number;
  failed: boolean;
}

/**
 * S4.2 — Push transactionnel : lit les `EventCaisse` non consommés (ordre `createdAt`),
 * les transmet au cloud par lots, marque `consumed` les ids accusés. Idempotent (un
 * rejeu ne duplique rien côté cloud) et résilient (échec transport → rien n'est marqué,
 * la sync rattrapera au retour du réseau — S4.4).
 */
export async function pushTransactionalEvents(
  transport: CloudSyncTransport,
  options: PushOptions = {},
): Promise<PushResult> {
  const batchSize = options.batchSize ?? 100;
  const maxBatches = options.maxBatches ?? 1000;

  let pushed = 0;
  let acked = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const events = (await listUnconsumedEvents(batchSize)) as OutboxEvent[];
    if (events.length === 0) break;

    batches += 1;
    pushed += events.length;

    let ackedIds: string[];
    try {
      const res = await transport.pushEvents(events);
      ackedIds = res.ackedIds;
    } catch (error) {
      // Résilience WAN : on n'avance pas le curseur, rejeu ultérieur.
      console.error("[cloud-sync] push échoué", error);
      return { pushed, acked, batches, failed: true };
    }

    if (ackedIds.length > 0) {
      await markEventsConsumed(ackedIds);
      acked += ackedIds.length;
    }

    // Accusé partiel : si tous les événements du lot ne sont pas accusés, on s'arrête
    // pour éviter une boucle infinie sur les mêmes non-accusés.
    if (ackedIds.length < events.length) break;
  }

  return { pushed, acked, batches, failed: false };
}

// ─── S4.3 — Pull référence (cloud → magasin, LWW) ───────────────────────────

export interface PullOptions {
  /** Curseur courant (timestamp/version) ; null = depuis le début. */
  cursor: string | null;
  /** Applique une mise à jour de référence en base magasin (LWW : le cloud gagne). */
  apply: (update: ReferenceUpdate) => Promise<void>;
}

export interface PullResult {
  applied: number;
  nextCursor: string | null;
  failed: boolean;
}

/**
 * S4.3 — Tire les mises à jour de référence depuis le curseur et les applique.
 * Si une application échoue, le curseur N'AVANCE PAS (le lot sera rejoué — S4.4).
 */
export async function pullReferenceUpdates(
  transport: CloudSyncTransport,
  options: PullOptions,
): Promise<PullResult> {
  if (!transport.pullReference) {
    return { applied: 0, nextCursor: options.cursor, failed: false };
  }

  let pulled: { updates: ReferenceUpdate[]; nextCursor: string | null };
  try {
    pulled = await transport.pullReference(options.cursor);
  } catch (error) {
    console.error("[cloud-sync] pull échoué", error);
    return { applied: 0, nextCursor: options.cursor, failed: true };
  }

  let applied = 0;
  try {
    for (const update of pulled.updates) {
      await options.apply(update);
      applied += 1;
    }
  } catch (error) {
    console.error("[cloud-sync] application référence échouée", error);
    // Curseur inchangé : rejeu intégral du lot au prochain passage.
    return { applied, nextCursor: options.cursor, failed: true };
  }

  // Aucune mise à jour : on conserve le curseur courant.
  const nextCursor = pulled.updates.length > 0 ? pulled.nextCursor : options.cursor;
  return { applied, nextCursor, failed: false };
}

// ─── S4.4 — Résilience WAN : réessai avec rejeu ─────────────────────────────

export interface RetryOptions {
  /** Nombre de réessais APRÈS la première tentative. */
  retries: number;
}

/**
 * S4.4 — Exécute `fn` avec réessais (reprise sur coupure WAN). Propage la dernière
 * erreur si toutes les tentatives échouent.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
