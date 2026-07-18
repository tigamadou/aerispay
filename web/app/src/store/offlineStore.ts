// TODO: Consider migrating to a service-worker-based approach for offline
// queue persistence and background sync. IndexedDB direct access from the
// main thread can block rendering on large queues. See SPECS/MULTI_ORGANISATION.md.

import { create } from "zustand";

// ─── Types ──────────────────────────────────────────

interface OfflineOperation {
  id: string; // unique offline ID for idempotency
  type: "VENTE" | "MOUVEMENT_MANUEL";
  payload: Record<string, unknown>;
  createdAt: string; // ISO 8601 local timestamp
}

interface OfflineState {
  isOnline: boolean;
  offlineSince: string | null; // ISO 8601
  readOnly: boolean;
  queue: OfflineOperation[];
  syncInProgress: boolean;
  lastSyncAt: string | null;
  lastSyncErrors: Array<{ operationId: string; error: string }>;
}

interface OfflineActions {
  setOnline: (online: boolean) => void;
  addToQueue: (op: Omit<OfflineOperation, "id" | "createdAt">) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  setSyncInProgress: (v: boolean) => void;
  setLastSync: (at: string, errors: Array<{ operationId: string; error: string }>) => void;
  checkReadOnly: (thresholdHours: number) => void;
}

// ─── IndexedDB helpers ──────────────────────────────

const DB_NAME = "aerispay-offline";
const STORE_NAME = "sync-queue";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistQueue(queue: OfflineOperation[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const op of queue) {
      store.put(op);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB may not be available in all contexts
  }
}

async function loadQueue(): Promise<OfflineOperation[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    const result = await new Promise<OfflineOperation[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as OfflineOperation[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

// ─── Store ──────────────────────────────────────────

function generateId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useOfflineStore = create<OfflineState & OfflineActions>((set, get) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  offlineSince: null,
  readOnly: false,
  queue: [],
  syncInProgress: false,
  lastSyncAt: null,
  lastSyncErrors: [],

  setOnline: (online) => {
    const state = get();
    if (!online && state.isOnline) {
      // Going offline
      set({ isOnline: false, offlineSince: new Date().toISOString() });
    } else if (online && !state.isOnline) {
      // Coming back online
      set({ isOnline: true, offlineSince: null, readOnly: false });
    }
  },

  addToQueue: (op) => {
    const entry: OfflineOperation = {
      id: generateId(),
      ...op,
      createdAt: new Date().toISOString(),
    };
    const newQueue = [...get().queue, entry];
    set({ queue: newQueue });
    void persistQueue(newQueue);
  },

  removeFromQueue: (id) => {
    const newQueue = get().queue.filter((o) => o.id !== id);
    set({ queue: newQueue });
    void persistQueue(newQueue);
  },

  clearQueue: () => {
    set({ queue: [] });
    void persistQueue([]);
  },

  setSyncInProgress: (v) => set({ syncInProgress: v }),

  setLastSync: (at, errors) => set({ lastSyncAt: at, lastSyncErrors: errors }),

  checkReadOnly: (thresholdHours) => {
    const { offlineSince } = get();
    if (!offlineSince) return;
    const elapsed = (Date.now() - new Date(offlineSince).getTime()) / (1000 * 60 * 60);
    if (elapsed >= thresholdHours) {
      set({ readOnly: true });
    }
  },
}));

/**
 * Initialize the offline store: load persisted queue and set up listeners.
 * Call this once at app startup (e.g. in a layout effect).
 */
export async function initOfflineStore(): Promise<void> {
  const queue = await loadQueue();
  useOfflineStore.setState({ queue });

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => useOfflineStore.getState().setOnline(true));
    window.addEventListener("offline", () => useOfflineStore.getState().setOnline(false));
  }
}
