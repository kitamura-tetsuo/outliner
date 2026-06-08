import { describe, expect, it } from "vitest";
import { yjsStore } from "../../stores/yjsStore.svelte";

// Integration test verifying Yjs connection state can be controlled and read without facade

describe("Yjs connection state (no facade)", () => {
    it("allows direct set/get on yjsStore", async () => {
        yjsStore.isConnected = true;
        expect(yjsStore.getIsConnected()).toBe(true);
    });
});
