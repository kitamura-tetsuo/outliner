import { describe, expect, it } from "vitest";
import { fluidStore } from "../../stores/fluidStore.svelte";
import { globalStore } from "../../stores/globalStore.svelte";

describe("GlobalStore integration", () => {
    it("links to fluid store connection state", () => {
        fluidStore.isInitializing = false as any;
        expect(globalStore.isConnected).toBe(fluidStore.isConnected);
    });
});
