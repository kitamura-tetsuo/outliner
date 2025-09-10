import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";
import { yjsStore } from "../../stores/yjsStore.svelte";
import ConnectionStatus from "../fixtures/ConnectionStatus.svelte";

// Integration test verifying global store proxies Yjs connection state

describe("GlobalStore integration", () => {
    it("mirrors Yjs connection state", async () => {
        render(ConnectionStatus);
        yjsStore.isConnected = true as any;
        await tick();
        expect(screen.getByTestId("global").textContent).toBe("true");
        expect(screen.getByTestId("yjs").textContent).toBe("true");
    });
});
