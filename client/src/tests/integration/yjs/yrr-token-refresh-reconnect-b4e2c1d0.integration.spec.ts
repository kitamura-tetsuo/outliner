import { describe, expect, it, vi } from "vitest";

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        auth: {
            currentUser: { getIdToken: vi.fn().mockResolvedValue("newToken") },
        },
        addEventListener: vi.fn(),
    },
}));

import { refreshAuthAndReconnect } from "../../../lib/yjs/tokenRefresh";

import type { HocuspocusProvider } from "@hocuspocus/provider";

describe("refreshAuthAndReconnect", () => {
    it("calls sendToken on the provider", async () => {
        const provider = {
            sendToken: vi.fn().mockResolvedValue(undefined),
            disconnect: vi.fn(),
            connect: vi.fn(),
        } as unknown as HocuspocusProvider;

        const handler = refreshAuthAndReconnect(provider);
        await handler();

        expect(provider.sendToken).toHaveBeenCalled();
    });

    it("does not abort an in-flight connection attempt while status is connecting", async () => {
        const provider = {
            status: "connecting",
            sendToken: vi.fn().mockResolvedValue(undefined),
            disconnect: vi.fn(),
            connect: vi.fn(),
        } as unknown as HocuspocusProvider;

        const handler = refreshAuthAndReconnect(provider);
        await handler();

        // Aborting mid-handshake surfaces "can't establish a connection" browser
        // errors; the in-flight attempt already fetches the fresh token itself.
        expect(provider.disconnect).not.toHaveBeenCalled();
        expect(provider.connect).not.toHaveBeenCalled();
        expect(provider.sendToken).not.toHaveBeenCalled();
    });

    it("connects when the provider is disconnected", async () => {
        const provider = {
            status: "disconnected",
            sendToken: vi.fn().mockResolvedValue(undefined),
            disconnect: vi.fn(),
            connect: vi.fn().mockResolvedValue(undefined),
        } as unknown as HocuspocusProvider;

        const handler = refreshAuthAndReconnect(provider);
        await handler();

        expect(provider.connect).toHaveBeenCalled();
        expect(provider.disconnect).not.toHaveBeenCalled();
    });

    it("tries reconnect if sendToken fails", async () => {
        const provider = {
            sendToken: vi.fn().mockRejectedValue(new Error("fail")),
            disconnect: vi.fn(),
            connect: vi.fn(),
        } as unknown as HocuspocusProvider;

        const handler = refreshAuthAndReconnect(provider);
        await handler();

        expect(provider.sendToken).toHaveBeenCalled();
        expect(provider.disconnect).toHaveBeenCalled();
        expect(provider.connect).toHaveBeenCalled();
    });
});
