import { describe, it, expect, beforeEach } from "vitest";
import { useOfflineStore } from "@/store/offlineStore";

describe("offlineStore", () => {
  beforeEach(() => {
    // Reset store state
    useOfflineStore.setState({
      isOnline: true,
      offlineSince: null,
      readOnly: false,
      queue: [],
      syncInProgress: false,
      lastSyncAt: null,
      lastSyncErrors: [],
    });
  });

  describe("setOnline", () => {
    it("sets offlineSince when going offline", () => {
      useOfflineStore.getState().setOnline(false);
      const state = useOfflineStore.getState();
      expect(state.isOnline).toBe(false);
      expect(state.offlineSince).not.toBeNull();
    });

    it("clears offlineSince and readOnly when coming back online", () => {
      useOfflineStore.setState({ isOnline: false, offlineSince: "2026-05-01T08:00:00Z", readOnly: true });
      useOfflineStore.getState().setOnline(true);
      const state = useOfflineStore.getState();
      expect(state.isOnline).toBe(true);
      expect(state.offlineSince).toBeNull();
      expect(state.readOnly).toBe(false);
    });

    it("does nothing if already online and setOnline(true)", () => {
      const before = useOfflineStore.getState().offlineSince;
      useOfflineStore.getState().setOnline(true);
      expect(useOfflineStore.getState().offlineSince).toBe(before);
    });
  });

  describe("queue management", () => {
    it("addToQueue adds an operation with generated id", () => {
      useOfflineStore.getState().addToQueue({
        type: "VENTE",
        payload: { sessionId: "s-1", lignes: [], paiements: [] },
      });
      const queue = useOfflineStore.getState().queue;
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toMatch(/^offline-/);
      expect(queue[0].type).toBe("VENTE");
      expect(queue[0].createdAt).toBeDefined();
    });

    it("removeFromQueue removes by id", () => {
      useOfflineStore.getState().addToQueue({ type: "VENTE", payload: {} });
      useOfflineStore.getState().addToQueue({ type: "MOUVEMENT_MANUEL", payload: {} });
      const queue = useOfflineStore.getState().queue;
      expect(queue).toHaveLength(2);

      useOfflineStore.getState().removeFromQueue(queue[0].id);
      expect(useOfflineStore.getState().queue).toHaveLength(1);
      expect(useOfflineStore.getState().queue[0].type).toBe("MOUVEMENT_MANUEL");
    });

    it("clearQueue empties the queue", () => {
      useOfflineStore.getState().addToQueue({ type: "VENTE", payload: {} });
      useOfflineStore.getState().addToQueue({ type: "VENTE", payload: {} });
      useOfflineStore.getState().clearQueue();
      expect(useOfflineStore.getState().queue).toHaveLength(0);
    });
  });

  describe("checkReadOnly", () => {
    it("sets readOnly when offline exceeds threshold", () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      useOfflineStore.setState({ offlineSince: fiveHoursAgo, isOnline: false });
      useOfflineStore.getState().checkReadOnly(4);
      expect(useOfflineStore.getState().readOnly).toBe(true);
    });

    it("does not set readOnly when within threshold", () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      useOfflineStore.setState({ offlineSince: oneHourAgo, isOnline: false });
      useOfflineStore.getState().checkReadOnly(4);
      expect(useOfflineStore.getState().readOnly).toBe(false);
    });

    it("does nothing when offlineSince is null", () => {
      useOfflineStore.getState().checkReadOnly(4);
      expect(useOfflineStore.getState().readOnly).toBe(false);
    });
  });

  describe("sync state", () => {
    it("setSyncInProgress updates flag", () => {
      useOfflineStore.getState().setSyncInProgress(true);
      expect(useOfflineStore.getState().syncInProgress).toBe(true);
      useOfflineStore.getState().setSyncInProgress(false);
      expect(useOfflineStore.getState().syncInProgress).toBe(false);
    });

    it("setLastSync records timestamp and errors", () => {
      const now = new Date().toISOString();
      useOfflineStore.getState().setLastSync(now, [
        { operationId: "op-1", error: "Stock insuffisant" },
      ]);
      const state = useOfflineStore.getState();
      expect(state.lastSyncAt).toBe(now);
      expect(state.lastSyncErrors).toHaveLength(1);
    });
  });
});
