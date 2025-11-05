import { describe, expect, it } from "vitest";
import type { YjsStore } from "../../../stores/yjsStore.svelte";

/**
 * Integration test mirroring e2e/new/yjs-basic-sync-a1b2c3d4.spec.ts
 * Ensures the Yjs store is exposed globally and reports connection state.
 */

describe("yjs basic sync", () => {
    it("exposes connection state", () => {
        const store = (globalThis as unknown).__YJS_STORE__ as YjsStore;
        expect(store).toBeDefined();
        expect(typeof store.getIsConnected()).toBe("boolean");
    });
});
