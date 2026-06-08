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
