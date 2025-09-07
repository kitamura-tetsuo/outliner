import { describe, expect, it } from "vitest";
import { store as globalStore } from "../../stores/globalStore.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";

describe("GlobalStore integration", () => {
    it("reflects connection state linkage", () => {
        expect(globalStore.isConnected).toBe(yjsStore.isConnected);
    });
});
