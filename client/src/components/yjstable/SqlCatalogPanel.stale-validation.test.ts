// Mounted oracle for issue #5576 REQ-003: a validation response stays bound
// to the submitted text. Edits typed while validation is pending render the
// late result stale — never a valid current preview for never-validated
// input, with refusal diagnostics kept on the submitted text.
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

const VALID_A = "CREATE TYPE mood AS ENUM ('a', 'b');";
const INVALID_B = "CREATE TABLE mood (id TEXT PRIMARY KEY);";

describe("SqlCatalogPanel late validation stays bound to the submitted text", () => {
    let releaseValidate: ((value: unknown) => void) | undefined;
    let refusalMode = false;

    beforeEach(() => {
        releaseValidate = undefined;
        refusalMode = false;
        globalUndoRouter.clear();
        fakeMonacoRegistry.reset();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string) => {
                const url = new URL(input, "http://127.0.0.1:7093");
                if (url.pathname === "/api/sql-catalog/read") {
                    return jsonResponse(200, {
                        snapshot: { projectId: "demo-project", format: 1, objects: [], revision: "rev-0" },
                    });
                }
                if (url.pathname === "/api/sql-catalog/validate") {
                    await new Promise(resolve => {
                        releaseValidate = resolve;
                    });
                    if (refusalMode) {
                        return jsonResponse(200, {
                            result: {
                                status: "refused",
                                reason: "invalid-candidate",
                                diagnostics: [{ objectId: "new", message: "unsupported declaration" }],
                            },
                        });
                    }
                    return jsonResponse(200, { result: { status: "preview", applied: false } });
                }
                return jsonResponse(404, { error: "nf" });
            }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    async function openDraftWithA(view: {
        getByTestId: (id: string) => HTMLElement;
        queryByTestId: (id: string) => HTMLElement | null;
    }) {
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-editor")).toBeTruthy());
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type(VALID_A);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-validate"));
        await waitFor(() => expect(view.queryByTestId("sql-catalog-validation")).toBeNull());
    }

    it("a late preview for A is stale for B, never valid for the current draft", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await openDraftWithA(view);
        fakeMonacoRegistry.lastModel().type(INVALID_B);
        await tick();
        releaseValidate?.(undefined);
        await waitFor(() => expect(view.getByTestId("sql-catalog-validation")).toBeTruthy());
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(INVALID_B);
        expect(view.getByTestId("sql-catalog-validation").textContent).toMatch(/Validation preview/);
        expect(view.getByTestId("sql-catalog-validation-stale")).toBeTruthy();
        view.unmount();
    });

    it("a late refusal keeps diagnostics on the submitted text, stale for B", async () => {
        refusalMode = true;
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await openDraftWithA(view);
        fakeMonacoRegistry.lastModel().type(INVALID_B);
        await tick();
        releaseValidate?.(undefined);
        await waitFor(() => expect(view.getByTestId("sql-catalog-validation")).toBeTruthy());
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(INVALID_B);
        expect(view.getByTestId("sql-catalog-validation").textContent).toMatch(/unsupported declaration/);
        expect(view.getByTestId("sql-catalog-validation-stale")).toBeTruthy();
        view.unmount();
    });
});
