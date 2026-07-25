import { beforeEach, describe, expect, it, vi } from "vitest";

const { MockHocuspocusProvider, getIdToken } = vi.hoisted(() => {
    class FakeAwareness {
        setLocalStateField = () => {};
        getStates() {
            return new Map();
        }
        getLocalState() {
            return null;
        }
        on() {}
        off() {}
    }

    class MockHocuspocusProvider {
        static instances: MockHocuspocusProvider[] = [];
        configuration: { url: string; name: string; document: unknown; token: unknown; };
        awareness = new FakeAwareness();
        isSynced = false;
        disconnect = vi.fn();
        destroy = () => {};

        constructor(configuration: { url: string; name: string; document: unknown; token: unknown; }) {
            this.configuration = configuration;
            MockHocuspocusProvider.instances.push(this);
        }

        on() {}
    }

    return {
        MockHocuspocusProvider,
        getIdToken: vi.fn(),
    };
});

vi.mock("../../../lib/yjsPersistence", () => ({
    createPersistence: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
    waitForSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@hocuspocus/provider", () => ({
    HocuspocusProvider: MockHocuspocusProvider,
}));

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        auth: { currentUser: { getIdToken: (forceRefresh: boolean) => getIdToken(forceRefresh) } },
        getCurrentUser: () => null,
        addEventListener: vi.fn(() => () => {}),
        refreshToken: () => Promise.resolve(),
    },
}));

import { createProjectConnection } from "../../../lib/yjs/connection";
import { clearRoomSyncStates, getRoomSyncState } from "../../../lib/yjs/roomSyncState";

type MockProviderInstance = InstanceType<typeof MockHocuspocusProvider> & {
    configuration: { token: () => Promise<string>; };
};

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("yjs connection: tokenProvider", () => {
    beforeEach(() => {
        MockHocuspocusProvider.instances = [];
        getIdToken.mockClear();
        clearRoomSyncStates();
    });

    it("does not fallback to '1' for non-demo rooms when auth token fails", async () => {
        vi.stubEnv("MODE", "production");
        // Setup: token fetching fails (e.g., offline)
        getIdToken.mockRejectedValue(new Error("Auth offline"));

        const _promise = createProjectConnection("proj-test-auth-fail");
        await flushMicrotasks();

        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;

        // Assert token function throws and sets state to auth-failed instead of returning "1"
        const tokenFn = provider.configuration.token;

        await expect(tokenFn()).rejects.toThrow(/getFreshIdToken resolved to empty token or failed/);

        expect(getRoomSyncState("projects/proj-test-auth-fail")).toBe("auth-failed");
        expect(provider.disconnect).toHaveBeenCalled();
    });

    it("does not fallback to '1' for non-demo rooms when auth token is empty", async () => {
        vi.stubEnv("MODE", "production");
        // Setup: token fetching returns empty string
        getIdToken.mockResolvedValue("");

        const _promise = createProjectConnection("proj-test-auth-empty");
        await flushMicrotasks();

        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        const tokenFn = provider.configuration.token;

        await expect(tokenFn()).rejects.toThrow(/getFreshIdToken resolved to empty token or failed/);

        expect(getRoomSyncState("projects/proj-test-auth-empty")).toBe("auth-failed");
        expect(provider.disconnect).toHaveBeenCalled();
    });
});
