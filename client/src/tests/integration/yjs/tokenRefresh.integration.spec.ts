import { describe, expect, it, vi } from "vitest";
import { userManager } from "../../../auth/UserManager";
import { refreshAuthAndReconnect } from "../../../lib/yjs/tokenRefresh";

describe("refreshAuthAndReconnect", () => {
    it("updates params and reconnects", async () => {
        const provider = {
            wsParams: {},
            shouldConnect: true,
            wsconnected: false,
            connect: vi.fn(),
        } as any;

        const original = userManager.auth.currentUser;
        Object.defineProperty(userManager.auth, "currentUser", {
            value: { getIdToken: vi.fn().mockResolvedValue("newToken") },
            configurable: true,
        });

        const handler = refreshAuthAndReconnect(provider);
        await handler();

        expect(provider.wsParams).toEqual({ auth: "newToken" });
        expect(provider.connect).toHaveBeenCalled();

        Object.defineProperty(userManager.auth, "currentUser", { value: original, configurable: true });
    });
});
