// Mounted oracle for issue #5576 REQ-001: edits accepted while an apply is
// pending survive the confirmed receipt as the exact unsaved draft, for both
// creation and replacement. Persisted source holds only the submitted text.
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

const SQL_A = "CREATE TYPE mood AS ENUM (\n  'a',\n  'b'\n);";
const SQL_B = "CREATE TYPE mood AS ENUM (\n  'b',\n  'a',\n  'c'\n);";

describe("SqlCatalogPanel pending apply preserves the newer draft", () => {
    let objects: { id: string; kind: string; source: string; }[] = [];
    let revision = 0;
    let releaseApply: ((value: unknown) => void) | undefined;

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
        releaseApply = undefined;
        globalUndoRouter.clear();
        fakeMonacoRegistry.reset();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string, init?: { body?: string; }) => {
                const url = new URL(input, "http://127.0.0.1:7093");
                if (url.pathname === "/api/sql-catalog/read") {
                    return jsonResponse(200, { snapshot: snapshot() });
                }
                if (url.pathname === "/api/sql-catalog/apply") {
                    await new Promise(resolve => {
                        releaseApply = resolve;
                    });
                    const body = JSON.parse(init?.body ?? "{}");
                    const before = snapshot();
                    const intent = body.intent;
                    if (intent.operation === "create") objects.push({ ...intent.object });
                    else if (intent.operation === "replace" && intent.object) {
                        objects = objects.map(entry => entry.id === intent.object.id ? { ...intent.object } : entry);
                    }
                    revision += 1;
                    return jsonResponse(200, {
                        result: {
                            status: "applied",
                            applied: true,
                            objectIds: [intent.object?.id],
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

    async function waitForReadyEditor(view: {
        getByTestId: (id: string) => HTMLElement;
        queryByTestId: (id: string) => HTMLElement | null;
    }) {
        await waitFor(() => expect(view.getByTestId("sql-catalog-editor")).toBeTruthy());
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
    }

    it("a confirmed create keeps edits typed while the request was pending", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitForReadyEditor(view);
        fakeMonacoRegistry.lastModel().type(SQL_A);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-create"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-apply-status").textContent).toMatch(/Applying source/)
        );
        // SQL typed during normal network latency belongs to a newer draft.
        fakeMonacoRegistry.lastModel().type(SQL_B);
        await tick();
        releaseApply?.(undefined);
        await waitFor(() => expect(view.getByTestId("sql-catalog-mutation-info").textContent).toMatch(/Saved/));
        // Persisted source holds only the submitted text; the newer edits
        // remain an exact visible unsaved draft instead of being cleared.
        expect(objects).toHaveLength(1);
        expect(objects[0]?.source).toBe(SQL_A);
        expect(view.getByTestId("sql-catalog-create-form")).toBeTruthy();
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(SQL_B);
        expect(view.getByTestId("sql-catalog-draft-status").textContent).toMatch(/Unsaved draft/);
        view.unmount();
    });

    it("a confirmed replace keeps edits typed while the request was pending", async () => {
        objects = [{ id: "enum-1", kind: "enum", source: SQL_A }];
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(1));
        await fireEvent.click(view.getByTestId("sql-catalog-item"));
        await fireEvent.click(view.getByTestId("sql-catalog-edit"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-save")).toBeTruthy());
        await waitForReadyEditor(view);
        await fireEvent.click(view.getByTestId("sql-catalog-save"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-apply-status").textContent).toMatch(/Applying source/)
        );
        fakeMonacoRegistry.lastModel().type(SQL_B);
        await tick();
        releaseApply?.(undefined);
        await waitFor(() => expect(view.getByTestId("sql-catalog-mutation-info").textContent).toMatch(/Saved/));
        expect(objects).toEqual([{ id: "enum-1", kind: "enum", source: SQL_A }]);
        expect(view.getByTestId("sql-catalog-save")).toBeTruthy();
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(SQL_B);
        expect(view.getByTestId("sql-catalog-draft-status").textContent).toMatch(/Unsaved draft/);
        view.unmount();
    });
});
