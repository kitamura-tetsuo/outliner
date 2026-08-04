import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Yjs client factories are stubbed: only the initialization ordering is under
// test here, not the transport. The stub exposes the minimum shape demoInit
// touches (getProject().ydoc).
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

vi.mock("../schema/app-schema", () => ({
    Project: {
        fromDoc: vi.fn().mockImplementation((ydoc: unknown) => ({ ydoc })),
    },
}));

const services = await import("../services");
const { seedDemo } = await import("./demoSeed");
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
        (services.acquireDemoClient as Mock).mockResolvedValue(makeClient("first"));
        (seedDemo as Mock).mockResolvedValue({ ok: true, reset: false });
    });

    afterEach(() => {
        resetDemoValidationState();
    });

    it("connects without waiting for the freshness validation response", async () => {
        // A validation request that never settles must not delay the connection.
        (seedDemo as Mock).mockImplementation(() => new Promise(() => {}));

        const handle = await initializeDemoProject();

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

        await initializeDemoProject();

        expect(order).toEqual(["seed", "connect"]);
    });

    it("reconnects with a fresh client when the server reseeded the document", async () => {
        (seedDemo as Mock).mockResolvedValue({ ok: true, reset: true });
        (services.acquireDemoClient as Mock)
            .mockResolvedValueOnce(makeClient("stale"))
            .mockResolvedValueOnce(makeClient("fresh"));

        const updates: unknown[] = [];
        const handle = await initializeDemoProject({ onValidated: (update) => updates.push(update) });
        expect((handle.client as unknown as { id: string; }).id).toBe("stale");

        await vi.waitFor(() => expect(updates.length).toBe(1));
        expect(services.removeYjsClientByProjectId).toHaveBeenCalledWith("demo");
        expect((updates[0] as { handle: { client: { id: string; }; }; }).handle.client.id).toBe("fresh");
    });

    it("keeps the connected client when no reset happened", async () => {
        const updates: { reset: boolean; }[] = [];
        await initializeDemoProject({ onValidated: (update) => updates.push(update) });

        await vi.waitFor(() => expect(updates.length).toBe(1));
        expect(updates[0].reset).toBe(false);
        expect(services.removeYjsClientByProjectId).not.toHaveBeenCalled();
        expect(services.acquireDemoClient).toHaveBeenCalledTimes(1);
    });

    it("reports a failed validation without discarding the connected client", async () => {
        (seedDemo as Mock).mockResolvedValue({ ok: false, reset: false, reason: "network" });

        const updates: { seedFailure?: string; }[] = [];
        const handle = await initializeDemoProject({ onValidated: (update) => updates.push(update) });

        await vi.waitFor(() => expect(updates.length).toBe(1));
        expect(updates[0].seedFailure).toBe("network");
        expect((handle.client as unknown as { id: string; }).id).toBe("first");
        expect(services.removeYjsClientByProjectId).not.toHaveBeenCalled();
    });

    it("reuses one validation request across demo routes", async () => {
        await initializeDemoProject();
        await initializeDemoProject();
        startDemoValidation();
        expect(seedDemo).toHaveBeenCalledTimes(1);
    });

    it("keeps the memo across a route swap, since SvelteKit destroys before it mounts", async () => {
        await initializeDemoProject();

        // The outgoing route releases the last reference before the incoming
        // route mounts; that must not cost another seed request.
        (services.releaseDemoClient as Mock).mockReturnValue(0);
        releaseDemoProject();
        await initializeDemoProject();

        expect(seedDemo).toHaveBeenCalledTimes(1);
    });

    it("revalidates once the memoized validation expired", async () => {
        const start = Date.now();
        const clock = vi.spyOn(Date, "now").mockReturnValue(start);
        try {
            await initializeDemoProject();
            expect(seedDemo).toHaveBeenCalledTimes(1);

            clock.mockReturnValue(start + 61000);
            startDemoValidation();
            expect(seedDemo).toHaveBeenCalledTimes(2);
        } finally {
            clock.mockRestore();
        }
    });

    it("surfaces an actionable error when the demo project cannot be connected", async () => {
        (services.acquireDemoClient as Mock).mockResolvedValue(undefined);
        (seedDemo as Mock).mockResolvedValue({ ok: false, reset: false, reason: "network" });

        await expect(initializeDemoProject()).rejects.toThrow("Can't reach the demo server");
    });
});
