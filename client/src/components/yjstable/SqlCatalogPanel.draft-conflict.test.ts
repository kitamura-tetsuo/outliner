// Mounted oracle for issue #5576 REQ-001/REQ-002: typing, opening the
// editor and Validate never touch committed catalog state or history, Cancel
// discards only the local draft, and a remote change while a draft exists
// conflicts with the draft preserved (no overwrite, no silent rebase).
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
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
const SOURCE_C = "CREATE TYPE mood AS ENUM ('a', 'b', 'c');";
const INVALID = "CREATE TABLE mood (id TEXT PRIMARY KEY);";

describe("SqlCatalogPanel draft preservation and conflict", () => {
    let objects: { id: string; kind: string; source: string; }[] = [];
    let revision = 0;

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
                    const body = JSON.parse(init?.body ?? "{}");
                    if (body.expectedRevision !== `rev-${revision}`) {
                        return jsonResponse(200, {
                            result: { status: "refused", reason: "stale", diagnostics: [{ message: "stale" }] },
                        });
                    }
                    const source = body.intent?.object?.source ?? "";
                    if (!source.includes("CREATE TYPE")) {
                        return jsonResponse(200, {
                            result: {
                                status: "refused",
                                reason: "invalid-candidate",
                                diagnostics: [{ objectId: "enum-1", message: "unsupported declaration" }],
                            },
                        });
                    }
                    return jsonResponse(200, { result: { status: "preview", applied: false } });
                }
                if (url.pathname === "/api/sql-catalog/apply") {
                    const body = JSON.parse(init?.body ?? "{}");
                    if (body.expectedRevision !== `rev-${revision}`) {
                        return jsonResponse(200, {
                            result: { status: "refused", reason: "stale", diagnostics: [{ message: "stale" }] },
                        });
                    }
                    const before = snapshot();
                    const intent = body.intent;
                    if (intent.operation === "replace" && intent.object) {
                        objects = objects.map(entry => entry.id === intent.object.id ? { ...intent.object } : entry);
                    }
                    revision += 1;
                    return jsonResponse(200, {
                        result: {
                            status: "applied",
                            applied: true,
                            objectIds: [intent.object.id],
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

    it("typing, Validate and Cancel leave committed source and history unchanged", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(1));
        await fireEvent.click(view.getByTestId("sql-catalog-item"));
        await fireEvent.click(view.getByTestId("sql-catalog-edit"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-save")).toBeTruthy());
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type(INVALID);
        await tick();
        expect(view.getByTestId("sql-catalog-draft-status").textContent).toMatch(/Unsaved draft/);
        await fireEvent.click(view.getByTestId("sql-catalog-validate"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-validation").textContent).toMatch(/unsupported declaration/)
        );
        expect(objects).toEqual([{ id: "enum-1", kind: "enum", source: SOURCE_A }]);
        expect(view.getByTestId("sql-catalog-revision").textContent).toContain("rev-0");
        expect(globalUndoRouter.undoDepth).toBe(0);
        await fireEvent.click(view.getByTestId("sql-catalog-cancel"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-draft-status").textContent).toMatch(/No unsaved draft/)
        );
        expect(view.queryByTestId("sql-catalog-save")).toBeNull();
        expect(objects).toEqual([{ id: "enum-1", kind: "enum", source: SOURCE_A }]);
        expect(globalUndoRouter.undoDepth).toBe(0);
        view.unmount();
    });

    it("a remote change before Apply conflicts and preserves the draft", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(1));
        await fireEvent.click(view.getByTestId("sql-catalog-item"));
        await fireEvent.click(view.getByTestId("sql-catalog-edit"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-save")).toBeTruthy());
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type(SOURCE_B);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-validate"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-validation").textContent).toMatch(/Not applied/));
        // Another authorized writer commits while the draft is open.
        objects = [{ id: "enum-1", kind: "enum", source: SOURCE_C }];
        revision += 1;
        await fireEvent.click(view.getByTestId("sql-catalog-refresh"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-conflict").textContent).toMatch(/Conflict/));
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(SOURCE_B);
        await fireEvent.click(view.getByTestId("sql-catalog-save"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-mutation-error").textContent).toMatch(/stale/));
        expect(view.getByTestId("sql-catalog-conflict").textContent).toMatch(/Draft preserved/);
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(SOURCE_B);
        expect(objects).toEqual([{ id: "enum-1", kind: "enum", source: SOURCE_C }]);
        expect(globalUndoRouter.undoDepth).toBe(0);
        view.unmount();
    });
});
