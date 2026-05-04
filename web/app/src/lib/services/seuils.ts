import { prisma } from "@/lib/db";

const DEFAULTS: Record<string, number> = {
  THRESHOLD_DISCREPANCY_MINOR: 500,
  THRESHOLD_DISCREPANCY_MEDIUM: 5000,
  THRESHOLD_DISCREPANCY_MAJOR: 5000,
  THRESHOLD_RECURRING_COUNT: 3,
  THRESHOLD_RECURRING_PERIOD_DAYS: 7,
  THRESHOLD_CASH_WITHDRAWAL_AUTH: 10000,
  THRESHOLD_EXPENSE_AUTH: 5000,
  THRESHOLD_MAX_RECOUNT_ATTEMPTS: 3,
  THRESHOLD_CV_TOLERANCE: 500,
  THRESHOLD_OFFLINE_READONLY_HOURS: 4,
};

let cache: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function loadSeuils(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cache && now - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }

  const rows = await prisma.seuilCaisse.findMany();
  const map = new Map<string, number>();

  // Start with defaults
  for (const [key, val] of Object.entries(DEFAULTS)) {
    map.set(key, val);
  }

  // Override with DB values
  for (const row of rows) {
    map.set(row.id, row.valeur);
  }

  cache = map;
  cacheTimestamp = now;
  return map;
}

export async function getSeuil(id: string): Promise<number> {
  const seuils = await loadSeuils();
  const val = seuils.get(id);
  if (val === undefined) {
    throw new Error(`Seuil inconnu: ${id}`);
  }
  return val;
}

export function invalidateSeuilsCache(): void {
  cache = null;
  cacheTimestamp = 0;
}
