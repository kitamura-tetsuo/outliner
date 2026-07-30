import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { setupProviderForRoom } from "./connection";
import { getRoomSyncState } from "./roomSyncState";

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: vi.fn(),
        refreshToken: vi.fn(),
    },
}));

vi.mock("@hocuspocus/provider", () => {
    class MockHocuspocusProvider {
        handlers: Record<string, unknown[]> = {};
        awareness = { setLocalStateField: vi.fn() };
        isSynced = true; // prevent waitForInitialSync timeout wait

        on = vi.fn((event: string, handler: unknown) => {
            if (!this.handlers[event]) this.handlers[event] = [];
            this.handlers[event].push(handler);
        });
        off = vi.fn();
        connect = vi.fn();
        disconnect = vi.fn();
        destroy = vi.fn();

        emit(event: string, ...args: unknown[]) {
            if (this.handlers[event]) {
                this.handlers[event].forEach(h => (h as (...args: unknown[]) => void)(...args));
            }
        }
    }
    return {
        HocuspocusProvider: MockHocuspocusProvider,
    };
});

// Helper for type-safe casting of the mocked provider
const asMockedProvider = (provider: unknown) => {
    return provider as {
        emit: (event: string, ...args: unknown[]) => void;
        connect: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
    };
};

describe("setupProviderForRoom", () => {
    let doc: Y.Doc;

    beforeEach(() => {
        vi.clearAllMocks();
        doc = new Y.Doc();
    });

    it("should retry exactly once on 4001, then deny on second failure (authenticationFailed then close)", async () => {
        const { provider } = await setupProviderForRoom("test-proj", "test-room", doc, "test-label");
        const mocked = asMockedProvider(provider);

        // First failure
        mocked.emit("authenticationFailed", { message: "Test Auth Failed" });
        mocked.emit("close", { code: 4001, reason: "Auth failed" });

        await vi.waitFor(() => expect(userManager.refreshToken).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(mocked.connect).toHaveBeenCalledTimes(1));
        expect(getRoomSyncState("test-room")).not.toBe("denied");

        // Second failure
        mocked.emit("authenticationFailed", { message: "Test Auth Failed Again" });
        mocked.emit("close", { code: 4001, reason: "Auth failed again" });

        await vi.waitFor(() => expect(userManager.refreshToken).toHaveBeenCalledTimes(1)); // No additional retry
        await vi.waitFor(() => expect(mocked.connect).toHaveBeenCalledTimes(1)); // No additional connect
        expect(getRoomSyncState("test-room")).toBe("denied");
        expect(mocked.disconnect).toHaveBeenCalledTimes(1);
    });

    it("should retry exactly once on 4001, then deny on second failure (close then authenticationFailed)", async () => {
        const { provider } = await setupProviderForRoom("test-proj", "test-room", doc, "test-label");
        const mocked = asMockedProvider(provider);

        // First failure
        mocked.emit("close", { code: 4001, reason: "Auth failed" });
        mocked.emit("authenticationFailed", { message: "Test Auth Failed" });

        await vi.waitFor(() => expect(userManager.refreshToken).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(mocked.connect).toHaveBeenCalledTimes(1));
        expect(getRoomSyncState("test-room")).not.toBe("denied");

        // Second failure
        mocked.emit("close", { code: 4001, reason: "Auth failed again" });
        mocked.emit("authenticationFailed", { message: "Test Auth Failed Again" });

        await vi.waitFor(() => expect(userManager.refreshToken).toHaveBeenCalledTimes(1)); // No additional retry
        await vi.waitFor(() => expect(mocked.connect).toHaveBeenCalledTimes(1)); // No additional connect
        expect(getRoomSyncState("test-room")).toBe("denied");
        expect(mocked.disconnect).toHaveBeenCalledTimes(1);
    });
});
