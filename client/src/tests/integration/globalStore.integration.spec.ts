import { describe, expect, it } from "vitest";
import { fluidStore } from "../../stores/fluidStore.svelte";
import { store as globalStore } from "../../stores/globalStore.svelte";

describe("GlobalStore integration", () => {
    it("reflects connection state linkage", () => {
        fluidStore.isInitializing = false as any;
        expect(globalStore.isConnected).toBe(fluidStore.isConnected);
    });
});
