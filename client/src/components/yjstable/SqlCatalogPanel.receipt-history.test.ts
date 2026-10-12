// Mounted regression oracle for issue #5577 REQ-003: history capture uses the
// server's confirmed receipt, never the display refresh.
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

interface StoredObject {
    id: string;
    kind: string;
    source: string;
}

function jsonResponse(status: number, payload: unknown) {
    return { ok: status >= 200 && status < 300, status, statusText: "OK", json: async () => payload };
}

const SOURCE_A = "CREATE TYPE mood AS ENUM ('a', 'b');";
const SOURCE_B = "CREATE TYPE mood AS ENUM ('b', 'a');";
const SOURCE_C = "CREATE TYPE mood AS ENUM ('a', 'b', 'c');";

describe("SqlCatalogPanel confirmed-receipt history", () => {
    let objects: StoredObject[] = [];
    let revision = 0;
    let failReads = false;
    let applyCount = 0;
    let peerAfterApply: StoredObject[] | undefined;

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
        failReads = false;
        applyCount = 0;
        peerAfterApply = undefined;
        globalUndoRouter.clear();
        fakeMonacoRegistry.reset();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string, init?: { body?: string; }) => {
                const url = new URL(input, "http://127.0.0.1:7093");
                if (url.pathname === "/api/sql-catalog/read") {
                    if (failReads) throw new TypeError("Failed to fetch");
                    return jsonResponse(200, { snapshot: snapshot() });
                }
                if (url.pathname === "/api/sql-catalog/apply") {
                    applyCount += 1;
                    const intent = JSON.parse(init?.body ?? "{}").intent;
                    const before = snapshot();
                    if (intent.operation === "create") objects.push({ ...intent.object });
                    else if (intent.operation === "replace" && intent.object) {
                        objects = objects.map(entry => entry.id === intent.object.id ? { ...intent.object } : entry);
                    } else if (intent.operation === "delete" && intent.objectId) {
                        objects = objects.filter(entry => entry.id !== intent.objectId);
                    }
                    revision += 1;
                    const after = snapshot();
                    const appliedId = intent.operation === "delete" ? intent.objectId : intent.object?.id;
                    if (peerAfterApply) {
                        objects = peerAfterApply.map(object => ({ ...object }));
                        peerAfterApply = undefined;
                        revision += 1;
                    }
                    return jsonResponse(200, {
                        result: { status: "applied", applied: true, objectIds: [appliedId], before, after },
                    });
                }
                return jsonResponse(404, { error: "nf" });
            }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("registers one history step when the refresh read fails after a confirmed create", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type("CREATE TYPE mood AS ENUM ('ok', 'bad');");
        await tick();
        failReads = true;
        await fireEvent.click(view.getByTestId("sql-catalog-create"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-mutation-info").textContent).toMatch(/Saved/));
        expect(globalUndoRouter.undoDepth).toBe(1);
        failReads = false;
        await fireEvent.click(view.getByTestId("sql-catalog-undo"));
        await waitFor(() => expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("applied"));
        expect(objects).toEqual([]);
        expect(globalUndoRouter.undoDepth).toBe(0);
        expect(globalUndoRouter.redoDepth).toBe(1);
        view.unmount();
    });

    it("captures the confirmed edit so Undo conflicts instead of overwriting a peer edit", async () => {
        objects = [{ id: "enum-1", kind: "enum", source: SOURCE_A }];
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(1));
        peerAfterApply = [{ id: "enum-1", kind: "enum", source: SOURCE_C }];
        await fireEvent.click(view.getByTestId("sql-catalog-item"));
        await fireEvent.click(view.getByTestId("sql-catalog-edit"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-save")).toBeTruthy());
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type(SOURCE_B);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-save"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-mutation-info").textContent).toMatch(/Saved/));
        expect(globalUndoRouter.undoDepth).toBe(1);
        const appliesBeforeUndo = applyCount;
        await fireEvent.click(view.getByTestId("sql-catalog-undo"));
        await waitFor(() => expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("conflict"));
        expect(globalUndoRouter.undoDepth).toBe(1);
        expect(globalUndoRouter.redoDepth).toBe(0);
        expect(applyCount).toBe(appliesBeforeUndo);
        expect(objects).toEqual([{ id: "enum-1", kind: "enum", source: SOURCE_C }]);
        view.unmount();
    });
});
