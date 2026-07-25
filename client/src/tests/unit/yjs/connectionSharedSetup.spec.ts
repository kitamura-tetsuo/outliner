import type { User } from "firebase/auth";
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

const { mockPersistenceDestroy } = vi.hoisted(() => ({ mockPersistenceDestroy: vi.fn() }));
vi.mock("../../../lib/yjsPersistence", () => ({
    createPersistence: vi.fn().mockResolvedValue({ destroy: mockPersistenceDestroy }),
    waitForSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@hocuspocus/provider", () => ({
    HocuspocusProvider: MockHocuspocusProvider,
}));

const mockAuth = {
    currentUser: { getIdToken: (forceRefresh: boolean) => getIdTokenSpy(forceRefresh) } as unknown as User | null,
};

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        get auth() {
            return mockAuth;
        },
        getCurrentUser: () => null,
        addEventListener: vi.fn(() => () => {}),
        refreshToken: () => refreshTokenSpy(),
    },
}));

vi.stubEnv("MODE", "production");

import {
    connectProjectDoc,
    createMinimalProjectConnection,
    createProjectConnection,
} from "../../../lib/yjs/connection";
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
        mockPersistenceDestroy.mockClear();
        clearRoomSyncStates();
        mockAuth.currentUser = {
            getIdToken: (forceRefresh: boolean) => getIdTokenSpy(forceRefresh),
        } as unknown as User;
    });

    it("never resolves to the demo dummy token '1' for a non-demo room on failure", async () => {
        const promise = createProjectConnection("proj-token-fail-test");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        provider.markSynced();
        await promise;

        const tokenFn = provider.configuration.token;
        getIdTokenSpy.mockRejectedValue(new Error("Auth failed"));

        vi.useFakeTimers();
        try {
            let error: Error | undefined;
            const tokenPromise = tokenFn().catch((e: unknown) => {
                error = e as Error;
            });

            // Advance timers enough to trigger all backoff intervals
            await vi.advanceTimersByTimeAsync(1000); // Attempt 1 wait
            await vi.advanceTimersByTimeAsync(2000); // Attempt 2 wait
            await vi.advanceTimersByTimeAsync(3000); // Attempt 3 wait

            await tokenPromise;
            expect(error).toBeDefined();
            expect(error?.message).toBe("Auth failed");
        } finally {
            vi.useRealTimers();
        }
    });

    it("waits for auth.currentUser to hydrate instead of immediately failing", async () => {
        mockAuth.currentUser = null;

        const promise = createProjectConnection("proj-hydrate-test");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        provider.markSynced();
        await promise;

        const tokenFn = provider.configuration.token;
        getIdTokenSpy.mockResolvedValue("hydrated-token");

        vi.useFakeTimers();
        try {
            let resolvedToken: string | undefined;
            const tokenPromise = tokenFn().then((t: string) => {
                resolvedToken = t;
            });

            // Advance time a bit but not enough to timeout the 5s loop
            await vi.advanceTimersByTimeAsync(1000);

            // Still waiting
            expect(resolvedToken).toBeUndefined();

            // Simulate hydration
            mockAuth.currentUser = {
                getIdToken: (forceRefresh: boolean) => getIdTokenSpy(forceRefresh),
            } as unknown as User;

            // Advance time to allow the loop to see currentUser and break
            await vi.advanceTimersByTimeAsync(200);

            await tokenPromise;
            expect(resolvedToken).toBe("hydrated-token");
        } finally {
            vi.useRealTimers();
        }
    });

    it("never resolves to the demo dummy token '1' when getFreshIdToken returns empty", async () => {
        const promise = createProjectConnection("proj-token-empty-test");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        provider.markSynced();
        await promise;

        const tokenFn = provider.configuration.token;
        // getFreshIdToken throws "Token is empty" when auth.currentUser.getIdToken returns empty.
        // This causes tokenProvider to retry and eventually throw "Token is empty".
        getIdTokenSpy.mockResolvedValue("");

        vi.useFakeTimers();
        try {
            let error: Error | undefined;
            const tokenPromise = tokenFn().catch((e: unknown) => {
                error = e as Error;
            });

            // Advance timers enough to trigger all backoff intervals
            await vi.advanceTimersByTimeAsync(1000); // Attempt 1 wait
            await vi.advanceTimersByTimeAsync(2000); // Attempt 2 wait
            await vi.advanceTimersByTimeAsync(3000); // Attempt 3 wait

            await tokenPromise;
            expect(error).toBeDefined();
            expect(error?.message).toBe("Token is empty");
        } finally {
            vi.useRealTimers();
        }
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

    it("uses the cached ID token by default and forces a refresh after a 4003 close", async () => {
        const promise = createProjectConnection("proj-token-test");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        provider.markSynced();
        await promise;

        const tokenFn = provider.configuration.token;

        getIdTokenSpy.mockResolvedValue("mock-token-1");
        await tokenFn();
        expect(getIdTokenSpy).toHaveBeenLastCalledWith(false);

        provider.emit("close", { code: 4003, reason: "Forbidden" } satisfies CloseEvent);
        // give microtasks a chance to run so the async IIFE executes
        await flushMicrotasks();
        expect(refreshTokenSpy).toHaveBeenCalled();

        getIdTokenSpy.mockResolvedValue("mock-token-2");
        await tokenFn();
        expect(getIdTokenSpy).toHaveBeenLastCalledWith(true);

        // Subsequent calls go back to using the cache
        getIdTokenSpy.mockResolvedValue("mock-token-3");
        await tokenFn();
        expect(getIdTokenSpy).toHaveBeenLastCalledWith(false);
    });

    it("retries a 4001 close once before giving up", async () => {
        const promise = createProjectConnection("proj-retry-test");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[0] as MockProviderInstance;
        provider.markSynced();
        await promise;

        const connectSpy = vi.spyOn(provider, "connect");
        const disconnectSpy = vi.spyOn(provider, "disconnect");
        const tokenFn = provider.configuration.token;

        // First 4001: should force a refresh and connect(), not disconnect()
        provider.emit("close", { code: 4001, reason: "Unauthorized" } satisfies CloseEvent);
        await flushMicrotasks();

        expect(refreshTokenSpy).toHaveBeenCalledTimes(1);
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(disconnectSpy).not.toHaveBeenCalled();

        getIdTokenSpy.mockResolvedValue("mock-token-retry");
        await tokenFn();
        expect(getIdTokenSpy).toHaveBeenLastCalledWith(true);

        // Second 4001: budget exhausted, should disconnect()
        provider.emit("close", { code: 4001, reason: "Unauthorized" } satisfies CloseEvent);
        await flushMicrotasks();

        expect(connectSpy).toHaveBeenCalledTimes(1); // not called again
        expect(disconnectSpy).toHaveBeenCalledTimes(1); // called this time
    });

    it.each(
        [
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
        ] as const,
    )("%s stops reconnect attempts on a permanent close code instead of retrying forever", async (_label, setup) => {
        const provider = await setup();

        const permanentCodes = [4003, 4005];

        for (const code of permanentCodes) {
            const disconnectSpy = vi.spyOn(provider, "disconnect");
            provider.emit("close", { code, reason: "PERMANENT" } satisfies CloseEvent);
            expect(disconnectSpy).toHaveBeenCalled();
            disconnectSpy.mockRestore();
        }
    });

    it.each(
        [
            ["createProjectConnection", async () => {
                const promise = createProjectConnection("proj-retry-1");
                await flushMicrotasks();
                const provider = MockHocuspocusProvider.instances[MockHocuspocusProvider.instances.length - 1];
                provider.markSynced();
                await promise;
                return provider;
            }],
            ["connectProjectDoc", async () => {
                const doc = new Y.Doc();
                await connectProjectDoc(doc, "proj-retry-2");
                return MockHocuspocusProvider.instances[MockHocuspocusProvider.instances.length - 1];
            }],
            ["createMinimalProjectConnection", async () => {
                await createMinimalProjectConnection("proj-retry-3");
                return MockHocuspocusProvider.instances[MockHocuspocusProvider.instances.length - 1];
            }],
        ] as const,
    )("%s keeps reconnect attempts on a retryable close code", async (_label, setup) => {
        const provider = await setup();

        const retryableCodes = [4004, 4006, 4008];

        for (const code of retryableCodes) {
            const disconnectSpy = vi.spyOn(provider, "disconnect");
            provider.emit("close", { code, reason: "RETRYABLE" } satisfies CloseEvent);
            expect(disconnectSpy).not.toHaveBeenCalled();
            disconnectSpy.mockRestore();
        }
    });

    it("destroys provider, doc, and persistence on permanent close code during initial sync", async () => {
        const promise = createProjectConnection("proj-fatal-rejection");
        await flushMicrotasks();
        const provider = MockHocuspocusProvider.instances[MockHocuspocusProvider.instances.length - 1];

        const providerDestroySpy = vi.spyOn(provider, "destroy");

        provider.emit("close", { code: 4003, reason: "Forbidden" } satisfies CloseEvent);

        await expect(promise).rejects.toThrow("Access Denied: 4003");

        expect(providerDestroySpy).toHaveBeenCalled();
        expect(mockPersistenceDestroy).toHaveBeenCalled();
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
