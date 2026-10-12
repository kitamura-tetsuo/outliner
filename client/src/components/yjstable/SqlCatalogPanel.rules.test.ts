// Mounted oracle for issue #5577: single-step history, explicit offline
// failure, denied-grant handling and visible first-release declarative rules.
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import SqlCatalogPanel from "./SqlCatalogPanel.svelte";

vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

const TEST_AUTHORIZATION = "Bearer test-token";
vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => ({ id: "u" }),
        auth: { currentUser: { getIdToken: async () => "test-token" } },
    },
}));

function jsonResponse(status: number, payload: unknown) {
    return { ok: status >= 200 && status < 300, status, statusText: "OK", json: async () => payload };
}

describe("SqlCatalogPanel authorization history rules", () => {
    let objects: { id: string; kind: string; source: string; }[] = [];
    let revision = 0;
    let failApply: "none" | "offline" | "denied" | "refused" = "none";

    beforeEach(() => {
        objects = [];
        revision = 0;
        failApply = "none";
        globalUndoRouter.clear();
        fakeMonacoRegistry.reset();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string, init?: { headers?: Record<string, string>; body?: string; }) => {
                const url = new URL(input, "http://127.0.0.1:7093");
                if (url.pathname === "/api/sql-catalog/read") {
                    return jsonResponse(200, {
                        snapshot: { projectId: "demo-project", format: 1, objects, revision: `rev-${revision}` },
                    });
                }
                if (url.pathname === "/api/sql-catalog/apply") {
                    if (failApply === "offline") throw new TypeError("Failed to fetch");
                    if (failApply === "denied") return jsonResponse(403, { error: "Forbidden", code: "forbidden" });
                    if (failApply === "refused") {
                        return jsonResponse(200, {
                            result: {
                                status: "refused",
                                reason: "referenced",
                                diagnostics: [{ message: "referenced" }],
                            },
                        });
                    }
                    const body = JSON.parse(init?.body ?? "{}");
                    const intent = body.intent;
                    if (intent.operation === "create") objects.push({ ...intent.object });
                    revision += 1;
                    return jsonResponse(200, {
                        result: { status: "applied", objectIds: [intent.object.id], before: {}, after: {} },
                    });
                }
                return jsonResponse(404, { error: "nf" });
            }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    interface PanelQueries {
        getByTestId: (testId: string) => HTMLElement;
        queryByTestId: (testId: string) => HTMLElement | null;
    }

    async function createOne(view: PanelQueries) {
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type("CREATE TYPE mood AS ENUM ('ok', 'bad');");
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-create"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-detail")).toBeTruthy());
    }

    it("lists first-release rules and records one history step per confirmed edit", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        const rules = await view.findByTestId("sql-catalog-first-release-rules");
        for (
            const phrase of ["refused before effects", "never rewrite Table records", "converted to TEXT", "not proof"]
        ) {
            expect(rules.textContent).toContain(phrase);
        }
        await createOne(view);
        expect(globalUndoRouter.undoDepth).toBe(1);
        failApply = "refused";
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type("CREATE TYPE other AS ENUM ('x');");
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-create"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-mutation-error")).toBeTruthy());
        expect(globalUndoRouter.undoDepth).toBe(1);
        view.unmount();
    });

    it("reports offline apply as unconfirmed without queueing and denies grants explicitly", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await createOne(view);
        failApply = "offline";
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitFor(() => expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull());
        fakeMonacoRegistry.lastModel().type("CREATE TYPE late AS ENUM ('x');");
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-create"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-mutation-error").textContent).toMatch(/Not confirmed/)
        );
        expect(view.getByTestId("sql-catalog-mutation-error").textContent).toMatch(/nothing was queued/);
        expect(globalUndoRouter.undoDepth).toBe(1);
        failApply = "denied";
        await fireEvent.click(view.getByTestId("sql-catalog-create"));
        await waitFor(() =>
            expect(view.getByTestId("sql-catalog-mutation-error").textContent).toMatch(/Access denied/)
        );
        expect(globalUndoRouter.undoDepth).toBe(1);
        view.unmount();
    });
});
