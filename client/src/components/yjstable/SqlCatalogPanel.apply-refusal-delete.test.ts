// Mounted regression oracle for issue #5576 REQ-003: an apply refusal names
// the offending declaration/dependency, and a confirmed delete records its
// own commit while runtime rebuilds instead of staying ready on the old build.
import { fireEvent, render, waitFor } from "@testing-library/svelte";
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

// Minimal runtime source: replays the installed revision and records rebuild
// requests, so the delete path proves the commit moves the runtime off the
// old build instead of staying ready on it.
function createRuntimeHarness(initial: CatalogRuntimeState) {
    const listeners = new Set<(state: CatalogRuntimeState) => void>();
    let current = initial;
    const port: SqlCatalogRuntimePort = {
        subscribe: listener => {
            listeners.add(listener);
            listener(current);
            return () => {
                listeners.delete(listener);
            };
        },
        rebuild: () => {},
    };
    return {
        port,
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

describe("SqlCatalogPanel apply refusal identity and delete commit", () => {
    let objects: { id: string; kind: string; source: string; }[] = [];
    let revision = 0;
    let refuseApply = false;

    function snapshot() {
        return {
            projectId: "demo-project",
            format: 1,
            objects: objects.map(object => ({ ...object })),
            revision: `rev-${revision}`,
        };
    }

    beforeEach(() => {
        objects = [{ id: "enum-1", kind: "enum", source: SOURCE_A }];
        revision = 0;
        refuseApply = false;
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
                    if (refuseApply) {
                        return jsonResponse(200, {
                            result: {
                                status: "refused",
                                reason: "referenced",
                                diagnostics: [{ objectId: "enum-1", message: "referenced by records" }],
                            },
                        });
                    }
                    const body = JSON.parse(init?.body ?? "{}");
                    const before = snapshot();
                    const intent = body.intent;
                    if (intent.operation === "delete") {
                        objects = objects.filter(entry => entry.id !== intent.objectId);
                    } else if (intent.operation === "replace" && intent.object) {
                        objects = objects.map(entry => entry.id === intent.object.id ? { ...intent.object } : entry);
                    } else if (intent.operation === "create" && intent.object) {
                        objects.push({ ...intent.object });
                    }
                    revision += 1;
                    return jsonResponse(200, {
                        result: {
                            status: "applied",
                            applied: true,
                            objectIds: [intent.object?.id ?? intent.objectId],
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

    it("apply refusal names the offending declaration", async () => {
        refuseApply = true;
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(1));
        await fireEvent.click(view.getByTestId("sql-catalog-item"));
        await fireEvent.click(view.getByTestId("sql-catalog-edit"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-save")).toBeTruthy());
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        await fireEvent.click(view.getByTestId("sql-catalog-save"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-mutation-error").textContent).toMatch(/enum-1/));
        view.unmount();
    });

    it("confirmed delete commits the new revision and rebuilds runtime", async () => {
        const harness = createRuntimeHarness(readyState("doc-rev-0"));
        const view = render(SqlCatalogPanel, {
            props: { projectId: "demo-project", runtimePort: harness.port },
        });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(1));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(
                /ready for persisted revision doc-rev-0/,
            )
        );
        await fireEvent.click(view.getByTestId("sql-catalog-item"));
        await fireEvent.click(view.getByTestId("sql-catalog-delete"));
        await fireEvent.click(view.getByTestId("sql-catalog-confirm-delete"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        expect(view.getByTestId("sql-catalog-commit-status").textContent).toMatch(/rev-1/);
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(/building/);
        expect(view.getByTestId("sql-catalog-runtime-status").textContent).not.toMatch(
            /ready for persisted revision doc-rev-0/,
        );
        // The runtime observing the committed deletion rebuilds instead of
        // staying ready on the old build; only its installed revision may
        // report ready again.
        harness.push({ status: "building", revision: "doc-rev-1" });
        await waitFor(() => expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(/building/));
        harness.push(readyState("doc-rev-1"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-runtime-status").textContent).toMatch(
                /ready for persisted revision doc-rev-1/,
            )
        );
        view.unmount();
    });
});
