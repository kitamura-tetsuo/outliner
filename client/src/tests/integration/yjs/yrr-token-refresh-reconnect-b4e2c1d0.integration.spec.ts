import { describe, expect, it, vi } from "vitest";

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        auth: {
            currentUser: { getIdToken: vi.fn().mockResolvedValue("newToken") },
        },
    },
}));

import type { WebsocketProvider } from "y-websocket";
import { refreshAuthAndReconnect } from "../../../lib/yjs/tokenRefresh";

describe("refreshAuthAndReconnect", () => {
    it("updates params and reconnects", async () => {
        // Set NODE_ENV to test to ensure timestamp is appended
        vi.stubGlobal("process", {
            ...process,
            env: { ...process.env, NODE_ENV: "test" },
        });

        const provider = {
            params: {},
            shouldConnect: true,
            wsconnected: false,
            connect: vi.fn(),
        } as unknown as WebsocketProvider;

        const handler = refreshAuthAndReconnect(provider);
        await handler();

        // テスト環境では "newToken:timestamp" 形式になる
        expect(provider.params.auth).toMatch(/^newToken:\d+$/);
        expect(provider.connect).toHaveBeenCalled();
    });
});
