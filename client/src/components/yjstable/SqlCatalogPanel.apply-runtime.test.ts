// Mounted oracle for issue #5576 REQ-003/REQ-004: draft, validation,
// pending apply, confirmed commit, runtime and unconfirmed outcomes stay
// separate (no single success indicator, stale previews never succeed), and
// reload reads persisted source without repairing it from editor state.
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import type { CatalogRuntimeState, SqlCatalogRuntimePort } from "../../services/yjstable/catalogRuntime";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import SqlCatalogPanel from "./SqlCatalogPanel.svelte";

vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => ({ id: "u" }),
        auth: { currentUser: { getIdToken: async () => "test-token" } },
    },
}));

function jsonResponse(status: number, payload: unknown) {
    return { ok: status >= 200 && status < 300, status, statusText: "OK", json: async () => payload };
}

const SOURCE_A = "CREATE TYPE mood AS ENUM ('a', 'b');";
const SOURCE_B = "CREATE TYPE mood AS ENUM ('b', 'a');";

// Controlled stand-in for the production runtime boundary: it replays real
// installation states (building, ready with an installed revision, error
// with diagnostics) and records rebuild requests without reporting ready.
function createRuntimeHarness() {
    const listeners = new Set<(state: CatalogRuntimeState) => void>();
    let current: CatalogRuntimeState = { status: "building", revision: "doc-rev-0" };
    let rebuilds = 0;
    const port: SqlCatalogRuntimePort = {
        subscribe: listener => {
            listeners.add(listener);
            listener(current);
            return () => {
                listeners.delete(listener);
            };
        },
        rebuild: () => {
            rebuilds += 1;
        },
    };
    return {
        port,
        rebuildCount: () => rebuilds,
        push: (state: CatalogRuntimeState) => {
            current = state;
            for (const listener of [...listeners]) listener(state);
        },
    };
}

function readyState(revision: string): CatalogRuntimeState {
    return {
        status: "ready",
        snapshot: { projectId: "demo-project", format: 1, objects: [], revision },
        generation: 1,
    };
}

describe("SqlCatalogPanel separated apply and runtime states", () => {
    let objects: { id: string; kind: string; source: string; }[] = [];
    let revision = 0;
    let holdApply = false;
    let releaseApply: ((value: unknown) => void) | undefined;
    let failApply = false;

    function snapshot() {
        return {
            projectId: "demo-project",
            format: 1,
            objects: objects.map(object => ({ ...object })),
            revision: `rev-${revision}`,
        };
    }

    beforeEach(() => {
        objects = [];
        revision = 0;
        holdApply = false;
        releaseApply = undefined;
        failApply = false;
        globalUndoRouter.clear();
        fakeMonacoRegistry.reset();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string, init?: { body?: string; }) => {
                const url = new URL(input, "http://127.0.0.1:7093");
                if (url.pathname === "/api/sql-catalog/read") {
                    return jsonResponse(200, { snapshot: snapshot() });
                }
                if (url.pathname === "/api/sql-catalog/validate") {
                    return jsonResponse(200, { result: { status: "preview", applied: false } });
                }
                if (url.pathname === "/api/sql-catalog/apply") {
                    if (failApply) throw new TypeError("Failed to fetch");
                    if (holdApply) {
                        await new Promise(resolve => {
                            releaseApply = resolve;
                        });
                    }
                    const body = JSON.parse(init?.body ?? "{}");
                    const before = snapshot();
                    objects.push({ ...body.intent.object });
                    revision += 1;
                    return jsonResponse(200, {
                        result: {
                            status: "applied",
                            applied: true,
                            objectIds: [body.intent.object.id],
                            before,
                            after: snapshot(),
                        },
                    });
                }
                return jsonResponse(404, { error: "nf" });
            }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("readiness tracks the installed runtime revision; rebuild alone never reports ready", async () => {
        const harness = createRuntimeHarness();
        const view = render(SqlCatalogPanel, {
            props: { projectId: "demo-project", runtimePort: harness.port },
        });
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        // The persisted catalog is nonempty-capable but the runtime has not
        // installed anything: readiness stays pending, never ready.
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(/building/);
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).not.toMatch(/Runtime ready/);
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type(SOURCE_A);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-validate"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-validation").textContent).toMatch(/Not applied/));
        holdApply = true;
        await fireEvent.click(view.getByTestId("sql-catalog-create"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-apply-status").textContent).toMatch(/Applying source/)
        );
        expect(view.queryByTestId("sql-catalog-commit-status")).toBeNull();
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).not.toMatch(/Runtime ready/);
        releaseApply?.(undefined);
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-commit-status").textContent).toMatch(/Source committed/)
        );
        // The confirmed source commit is not runtime readiness.
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(/building/);
        // Rebuild requests a real rebuild but establishes no readiness.
        expect(harness.rebuildCount()).toBe(0);
        await fireEvent.click(view.getByTestId("sql-catalog-rebuild-runtime"));
        expect(harness.rebuildCount()).toBe(1);
        await tick();
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(/building/);
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).not.toMatch(/Runtime ready/);
        // A failed installation surfaces error diagnostics, not readiness.
        harness.push({ status: "error", revision: "doc-rev-1", message: 'relation "mood" does not exist' });
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(/Runtime error/)
        );
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(/does not exist/);
        // Only the successor's successful installation reports ready, and
        // only for its installed revision.
        harness.push(readyState("doc-rev-2"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(
                /ready for persisted revision doc-rev-2/,
            )
        );
        expect(view.getByTestId("sql-catalog-draft-status").textContent).toMatch(/No unsaved draft/);
        view.unmount();
    });

    it("unconfirmed apply records no success and reload never repairs from the draft", async () => {
        objects = [{ id: "enum-1", kind: "enum", source: SOURCE_A }];
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(1));
        failApply = true;
        await fireEvent.click(view.getByTestId("sql-catalog-item"));
        await fireEvent.click(view.getByTestId("sql-catalog-edit"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-save")).toBeTruthy());
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type(SOURCE_B);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-save"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-unconfirmed").textContent).toMatch(/Not confirmed/));
        expect(view.getByTestId("sql-catalog-unconfirmed").textContent).toMatch(/nothing was queued/);
        expect(view.queryByTestId("sql-catalog-commit-status")).toBeNull();
        expect(objects).toEqual([{ id: "enum-1", kind: "enum", source: SOURCE_A }]);
        expect(globalUndoRouter.undoDepth).toBe(0);
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(SOURCE_B);
        // The persisted definition disappears remotely; reload shows the
        // removal instead of resurrecting it from the preserved draft.
        failApply = false;
        objects = [];
        revision += 1;
        await fireEvent.click(view.getByTestId("sql-catalog-refresh"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        expect(view.queryAllByTestId("sql-catalog-item")).toHaveLength(0);
        expect(view.getByTestId("sql-catalog-draft-status").textContent).toMatch(/Unsaved draft/);
        expect(view.getByTestId("sql-catalog-conflict").textContent).toMatch(/Draft preserved/);
        view.unmount();
    });
});
