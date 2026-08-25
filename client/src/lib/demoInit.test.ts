import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Scope of the mocks below: this suite covers the *ordering* contract of the
// demo initialization workflow (validation and connection start together; the
// verdict is applied afterwards) — not the Yjs transport or the reference
// counter itself.
//
// - `../services`: `acquireDemoClient` opens a real websocket to the demo room,
//   which a unit test cannot do. The reference counter it wraps is exercised for
//   real by the demo E2E specs (`dmo-demo-shared-initialization-3c7e5b12`).
// - `./demoSeed`: replaces one `fetch` round trip, mirroring how demoSeed.test.ts
//   stubs `globalThis.fetch`.
//
// Everything else (Project.fromDoc, the stores, real Y.Docs) runs unmocked.
vi.mock("../services", () => ({
    acquireDemoClient: vi.fn(),
    releaseDemoClient: vi.fn().mockReturnValue(0),
    removeYjsClientByProjectId: vi.fn(),
    resetDemoClientState: vi.fn(),
}));

vi.mock("./demoSeed", () => ({
    DEMO_PROJECT_NAME: "demo",
    seedDemo: vi.fn(),
    SeedDemoError: class SeedDemoError extends Error {},
}));

const services = await import("../services");
const { seedDemo } = await import("./demoSeed");
const { store } = await import("../stores/store.svelte");
const { yjsStore } = await import("../stores/yjsStore.svelte");
const {
    initializeDemoProject,
    releaseDemoProject,
    resetDemoValidationState,
    startDemoValidation,
} = await import("./demoInit");

const Y = await import("yjs");

// One Y.Doc per stub client id, so repeated makeClient(id) calls stay
// referentially comparable while the store still gets a real document.
const docs = new Map<string, InstanceType<typeof Y.Doc>>();

function makeClient(id: string) {
    if (!docs.has(id)) docs.set(id, new Y.Doc());
    const ydoc = docs.get(id)!;
    return { id, getProject: () => ({ ydoc }) };
}

describe("demoInit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetDemoValidationState();
        // mockReset clears any leftover one-shot implementations from a previous test.
        (services.acquireDemoClient as Mock).mockReset();
        (services.releaseDemoClient as Mock).mockReset().mockReturnValue(0);
        (services.acquireDemoClient as Mock).mockResolvedValue(makeClient("first"));
        (seedDemo as Mock).mockResolvedValue({ ok: true, reset: false });
    });

    afterEach(() => {
        resetDemoValidationState();
    });

    it("connects without waiting for the freshness validation response", async () => {
        // A validation request that never settles must not delay the connection.
        (seedDemo as Mock).mockImplementation(() => new Promise(() => {}));

        const handle = await initializeDemoProject("demo");

        expect((handle.client as unknown as { id: string; }).id).toBe("first");
        expect(services.acquireDemoClient).toHaveBeenCalledTimes(1);
    });

    it("starts the validation request and the connection in the same tick", async () => {
        const order: string[] = [];
        (seedDemo as Mock).mockImplementation(() => {
            order.push("seed");
            return new Promise(() => {});
        });
        (services.acquireDemoClient as Mock).mockImplementation(() => {
            order.push("connect");
            return Promise.resolve(makeClient("first"));
        });

        await initializeDemoProject("demo");

        expect(order).toEqual(["seed", "connect"]);
    });

    it("reconnects with a fresh client when the server reseeded the document", async () => {
        (seedDemo as Mock).mockResolvedValue({ ok: true, reset: true });
        (services.acquireDemoClient as Mock)
            .mockResolvedValueOnce(makeClient("stale"))
            .mockResolvedValueOnce(makeClient("fresh"));

        const updates: unknown[] = [];
        const handle = await initializeDemoProject("demo", { onValidated: (update) => updates.push(update) });
        expect((handle.client as unknown as { id: string; }).id).toBe("stale");

        await vi.waitFor(() => expect(updates.length).toBe(1));
        expect(services.removeYjsClientByProjectId).toHaveBeenCalledWith("demo");
        expect((updates[0] as { handle: { client: { id: string; }; }; }).handle.client.id).toBe("fresh");
    });

    it("returns the refreshed client when a standalone route waits for validation", async () => {
        (seedDemo as Mock).mockResolvedValue({ ok: true, reset: true });
        (services.acquireDemoClient as Mock)
            .mockResolvedValueOnce(makeClient("stale"))
            .mockResolvedValueOnce(makeClient("fresh"));

        const handle = await initializeDemoProject("demo", { waitForValidation: true });

        expect((handle.client as unknown as { id: string; }).id).toBe("fresh");
        expect(services.removeYjsClientByProjectId).toHaveBeenCalledWith("demo");
    });

    it("keeps the connected client when no reset happened", async () => {
        const updates: { reset: boolean; }[] = [];
        await initializeDemoProject("demo", { onValidated: (update) => updates.push(update) });

        await vi.waitFor(() => expect(updates.length).toBe(1));
        expect(updates[0].reset).toBe(false);
        expect(services.removeYjsClientByProjectId).not.toHaveBeenCalled();
        expect(services.acquireDemoClient).toHaveBeenCalledTimes(1);
    });

    it("reports a failed validation without discarding the connected client", async () => {
        (seedDemo as Mock).mockResolvedValue({ ok: false, reset: false, reason: "network" });

        const updates: { seedFailure?: string; }[] = [];
        const handle = await initializeDemoProject("demo", { onValidated: (update) => updates.push(update) });

        await vi.waitFor(() => expect(updates.length).toBe(1));
        expect(updates[0].seedFailure).toBe("network");
        expect((handle.client as unknown as { id: string; }).id).toBe("first");
        expect(services.removeYjsClientByProjectId).not.toHaveBeenCalled();
    });

    it("reuses one validation request across demo routes", async () => {
        await initializeDemoProject("demo");
        await initializeDemoProject("demo");
        startDemoValidation("demo");
        expect(seedDemo).toHaveBeenCalledTimes(1);
    });

    it("keeps the memo across a route swap, since SvelteKit destroys before it mounts", async () => {
        await initializeDemoProject("demo");

        // The outgoing route releases the last reference before the incoming
        // route mounts; that must not cost another seed request.
        (services.releaseDemoClient as Mock).mockReturnValue(0);
        releaseDemoProject("demo");
        await initializeDemoProject("demo");

        expect(seedDemo).toHaveBeenCalledTimes(1);
    });

    it("revalidates once the memoized validation expired", async () => {
        const start = Date.now();
        const clock = vi.spyOn(Date, "now").mockReturnValue(start);
        try {
            await initializeDemoProject("demo");
            expect(seedDemo).toHaveBeenCalledTimes(1);

            clock.mockReturnValue(start + 61000);
            startDemoValidation("demo");
            expect(seedDemo).toHaveBeenCalledTimes(2);
        } finally {
            clock.mockRestore();
        }
    });

    it("releases the replacement client when the route is destroyed mid-reconnect", async () => {
        (seedDemo as Mock).mockResolvedValue({ ok: true, reset: true });
        let finishReconnect: (() => void) | undefined;
        (services.acquireDemoClient as Mock)
            .mockResolvedValueOnce(makeClient("stale"))
            .mockImplementationOnce(() =>
                new Promise(resolve => {
                    finishReconnect = () => resolve(makeClient("fresh"));
                })
            );

        let destroyed = false;
        const updates: unknown[] = [];
        await initializeDemoProject("demo", { isDestroyed: () => destroyed, onValidated: (u) => updates.push(u) });

        // The route goes away while the replacement connection is in flight.
        await vi.waitFor(() => expect(finishReconnect).toBeDefined());
        destroyed = true;
        finishReconnect!();

        await vi.waitFor(() => expect(services.acquireDemoClient).toHaveBeenCalledTimes(2));
        // The replacement's own reference must be released, not leaked.
        await vi.waitFor(() => expect(services.releaseDemoClient).toHaveBeenCalled());
        expect(updates).toHaveLength(0);
        expect(store.project).toBeUndefined();
        expect(yjsStore.yjsClient).toBeUndefined();
    });

    it("surfaces an actionable error when the demo project cannot be connected", async () => {
        (services.acquireDemoClient as Mock).mockResolvedValue(undefined);
        (seedDemo as Mock).mockResolvedValue({ ok: false, reset: false, reason: "network" });

        await expect(initializeDemoProject("demo")).rejects.toThrow("Can't reach the demo server");
    });
});

describe("demo project isolation", () => {
    beforeEach(() => {
        resetDemoValidationState();
        (seedDemo as Mock).mockReset().mockResolvedValue({ ok: true, reset: false });
    });

    afterEach(() => {
        resetDemoValidationState();
    });

    it("validates each demo project independently", () => {
        // One project per locale: validating /demo says nothing about whether
        // /demo-ja is fresh, so the memo cannot be shared between them.
        startDemoValidation("demo");
        startDemoValidation("demo-ja");
        startDemoValidation("demo");

        expect(seedDemo).toHaveBeenCalledTimes(2);
        expect((seedDemo as Mock).mock.calls.map(([project]) => project)).toEqual(["demo", "demo-ja"]);
    });

    it("forgets only the named project's validation", () => {
        startDemoValidation("demo");
        startDemoValidation("demo-ja");
        expect(seedDemo).toHaveBeenCalledTimes(2);

        resetDemoValidationState("demo");
        startDemoValidation("demo-ja");
        expect(seedDemo, "demo-ja stayed memoized").toHaveBeenCalledTimes(2);

        startDemoValidation("demo");
        expect(seedDemo, "demo revalidated").toHaveBeenCalledTimes(3);
    });
});
