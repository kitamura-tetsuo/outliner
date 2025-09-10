import { describe, expect, it, vi } from "vitest";

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        auth: {
            currentUser: { getIdToken: vi.fn().mockResolvedValue("newToken") },
        },
    },
}));

import { refreshAuthAndReconnect } from "../../../lib/yjs/tokenRefresh";

describe("refreshAuthAndReconnect", () => {
    it("updates params and reconnects", async () => {
        const provider = {
            params: {},
            shouldConnect: true,
            wsconnected: false,
            connect: vi.fn(),
        } as any;

        const handler = refreshAuthAndReconnect(provider);
        await handler();

        expect(provider.params).toEqual({ auth: "newToken" });
        expect(provider.connect).toHaveBeenCalled();
    });
});
