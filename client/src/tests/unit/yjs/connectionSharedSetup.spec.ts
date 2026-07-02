import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

type CloseEvent = { code?: number; reason?: string; };

// vi.mock factories are hoisted above imports, so mutable mock state must be created
// via vi.hoisted rather than as plain module-level variables.
const { MockHocuspocusProvider, getIdToken, refreshToken } = vi.hoisted(() => {
    class FakeAwareness {
        clientID = 1;
        private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
        setLocalStateField = () => {};
        getStates() {
            return new Map();
        }
        getLocalState() {
            return null;
        }
        on(event: string, cb: (...args: unknown[]) => void) {
            const set = this.listeners.get(event) ?? new Set();
            set.add(cb);
            this.listeners.set(event, set);
        }
        off(event: string, cb: (...args: unknown[]) => void) {
            this.listeners.get(event)?.delete(cb);
        }
    }

    class MockHocuspocusProvider {
        static instances: MockHocuspocusProvider[] = [];
        configuration: { url: string; name: string; document: unknown; token: unknown; };
        awareness = new FakeAwareness();
        isSynced = false;
        disconnect = () => {};
        destroy = () => {};
        connect = () => {};
        sendToken = () => {};
        private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

        constructor(configuration: { url: string; name: string; document: unknown; token: unknown; }) {
            this.configuration = configuration;
            MockHocuspocusProvider.instances.push(this);
        }

        on(event: string, cb: (...args: unknown[]) => void) {
            const set = this.listeners.get(event) ?? new Set();
            set.add(cb);
            this.listeners.set(event, set);
        }
        off(event: string, cb: (...args: unknown[]) => void) {
            this.listeners.get(event)?.delete(cb);
        }
        emit(event: string, payload?: unknown) {
            this.listeners.get(event)?.forEach((cb) => cb(payload));
        }
        markSynced() {
            this.isSynced = true;
            this.emit("synced", { state: true });
        }
    }

    return {
        MockHocuspocusProvider,
        getIdToken: (forceRefresh: boolean) => Promise.resolve(`token-force=${forceRefresh}`),
        refreshToken: () => {},
    };
});

const getIdTokenSpy = vi.fn(getIdToken);
const refreshTokenSpy = vi.fn(refreshToken);

vi.mock("../../../lib/yjsPersistence", () => ({
    createPersistence: vi.fn(),
    waitForSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@hocuspocus/provider", () => ({
    HocuspocusProvider: MockHocuspocusProvider,
}));

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        auth: { currentUser: { getIdToken: (forceRefresh: boolean) => getIdTokenSpy(forceRefresh) } },
        getCurrentUser: () => null,
        addEventListener: vi.fn(() => () => {}),
        refreshToken: () => refreshTokenSpy(),
    },
}));

import { connectProjectDoc, createMinimalProjectConnection, createProjectConnection } from "../../../lib/yjs/connection";
import { clearRoomSyncStates, getRoomSyncState } from "../../../lib/yjs/roomSyncState";

type MockProviderInstance = InstanceType<typeof MockHocuspocusProvider> & {
    configuration: { url: string; token: () => Promise<string>; };
};

// setupProviderForRoom awaits persistence attachment before constructing the provider, so the
// mock instance doesn't exist synchronously after calling createProjectConnection. A macrotask
// tick reliably drains any pending microtask chain in between.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("yjs connection: shared provider setup", () => {
    beforeEach(() => {
        MockHocuspocusProvider.instances = [];
        getIdTokenSpy.mockClear();
        refreshTokenSpy.mockClear();
        clearRoomSyncStates();
    });

    it("never places the auth token in the WebSocket URL", async () => {
        const promise = createProjectConnection("proj-url-test");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        provider.markSynced();
        await promise;

        expect(provider.configuration.url).not.toContain("token=");
        expect(typeof provider.configuration.token).toBe("function");
    });

    it("uses the cached ID token by default and only forces a refresh after a 4001 close", async () => {
        const promise = createProjectConnection("proj-token-test");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        provider.markSynced();
        await promise;

        const tokenFn = provider.configuration.token;

        await tokenFn();
        expect(getIdTokenSpy).toHaveBeenLastCalledWith(false);

        provider.emit("close", { code: 4001, reason: "Unauthorized" } satisfies CloseEvent);
        expect(refreshTokenSpy).toHaveBeenCalled();

        await tokenFn();
        expect(getIdTokenSpy).toHaveBeenLastCalledWith(true);

        // Subsequent calls go back to using the cache
        await tokenFn();
        expect(getIdTokenSpy).toHaveBeenLastCalledWith(false);
    });

    it.each([
        ["createProjectConnection", async () => {
            const promise = createProjectConnection("proj-fatal-1");
            await flushMicrotasks();
            const provider = MockHocuspocusProvider.instances[MockHocuspocusProvider.instances.length - 1];
            provider.markSynced();
            await promise;
            return provider;
        }],
        ["connectProjectDoc", async () => {
            const doc = new Y.Doc();
            await connectProjectDoc(doc, "proj-fatal-2");
            return MockHocuspocusProvider.instances[MockHocuspocusProvider.instances.length - 1];
        }],
        ["createMinimalProjectConnection", async () => {
            await createMinimalProjectConnection("proj-fatal-3");
            return MockHocuspocusProvider.instances[MockHocuspocusProvider.instances.length - 1];
        }],
    ] as const)("%s stops reconnect attempts on a fatal close code instead of retrying forever", async (_label, setup) => {
        const provider = await setup();
        const disconnectSpy = vi.spyOn(provider, "disconnect");

        provider.emit("close", { code: 4003, reason: "FORBIDDEN" } satisfies CloseEvent);

        expect(disconnectSpy).toHaveBeenCalled();
    });

    it("marks the room as timed-out (not silently synced) when initial sync never completes", async () => {
        vi.useFakeTimers();
        try {
            const promise = createProjectConnection("proj-timeout-test");
            // Never call markSynced(): the room should be considered "pending" until the timeout fires.
            await vi.advanceTimersByTimeAsync(30_000);
            await promise;

            expect(getRoomSyncState("projects/proj-timeout-test")).toBe("timed-out");
        } finally {
            vi.useRealTimers();
        }
    });
});
