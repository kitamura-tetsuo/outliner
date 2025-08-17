// @ts-nocheck
import { describe, expect, it } from "vitest";
import { fluidStore } from "./fluidStore.svelte";
import { store } from "./store.svelte";

class MockFluidClient {
    containerId = "c1";
    getProject() {
        return { title: "Test", items: [] } as any;
    }
    isContainerConnected = false;
    getConnectionStateString() {
        return "connected";
    }
    currentUser = { id: "u1" };
}

describe("fluidStore", () => {
    it("setting fluidClient updates store.project", () => {
        const client = new MockFluidClient();
        fluidStore.fluidClient = client as any;
        expect(store.project?.title).toBe("Test");
        expect(fluidStore.getCurrentContainerId()).toBe("c1");
    });
});
