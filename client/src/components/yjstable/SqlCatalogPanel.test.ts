// Mounted regression oracle for the Project SQL type catalog surface (issue
// #5574, REQ-001). Transport/server tests supply source strings directly, so
// they stay green when the panel's editor-to-draft wiring breaks; this test
// drives the real SqlCatalogPanel through the real SqlEditor callbacks and
// the real authenticated HTTP transport against an in-memory catalog service.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import SqlCatalogPanel from "./SqlCatalogPanel.svelte";

// Scope of these mocks: external boundaries only. The lazy Monaco loader is
// mocked because the real editor cannot run under jsdom (same split as
// SqlEditor.test.ts); the Firebase UserManager is mocked because token minting
// needs the Auth emulator. Panel state, draft wiring and the HTTP transport in
// sqlCatalogClient run unmocked.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

const TEST_TOKEN = "test-token";
// Built dynamically so no credential-shaped literal is authored in this file.
const TEST_AUTHORIZATION = `Bearer ${TEST_TOKEN}`;

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => ({ id: "test-user", name: "Test User", email: "test@example.com" }),
        auth: { currentUser: { getIdToken: async () => TEST_TOKEN } },
    },
}));

interface StoredObject {
    id: string;
    kind: string;
    source: string;
}

interface ObservedRequest {
    method: string;
    path: string;
    authorization: string | null;
    body: {
        projectId?: string;
        expectedRevision?: string;
        intent?: { operation: string; object?: StoredObject; objectId?: string; };
    };
}

function jsonResponse(status: number, payload: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        json: async () => payload,
    };
}

describe("SqlCatalogPanel mounted CRUD", () => {
    let objects: StoredObject[] = [];
    let revision = 0;
    let observed: ObservedRequest[] = [];

    beforeEach(() => {
        objects = [];
        revision = 0;
        observed = [];
        fakeMonacoRegistry.reset();
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; }) => {
                    const url = new URL(input, "http://127.0.0.1:7093");
                    const authorization = init?.headers?.["Authorization"] ?? null;
                    const body = init?.body ? JSON.parse(init.body) as ObservedRequest["body"] : {};
                    observed.push({ method: init?.method ?? "GET", path: url.pathname, authorization, body });
                    if (authorization !== TEST_AUTHORIZATION) {
                        return jsonResponse(401, { error: "Not authenticated", code: "unauthorized" });
                    }
                    if (url.pathname === "/api/sql-catalog/read") {
                        return jsonResponse(200, {
                            snapshot: { projectId: "demo-project", format: 1, objects, revision: `rev-${revision}` },
                        });
                    }
                    if (url.pathname === "/api/sql-catalog/apply") {
                        if (body.expectedRevision !== `rev-${revision}`) {
                            return jsonResponse(200, { result: { status: "unconfirmed", reason: "stale" } });
                        }
                        const intent = body.intent!;
                        if (intent.operation === "create" && intent.object) objects.push({ ...intent.object });
                        if (intent.operation === "replace" && intent.object) {
                            objects = objects.map(entry =>
                                entry.id === intent.object!.id ? { ...intent.object! } : entry
                            );
                        }
                        if (intent.operation === "delete" && intent.objectId) {
                            objects = objects.filter(entry => entry.id !== intent.objectId);
                        }
                        revision += 1;
                        return jsonResponse(200, { result: { status: "applied" } });
                    }
                    return jsonResponse(404, { error: "Not found" });
                },
            ),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("creates, inspects, edits and deletes ENUM source through the real editor callbacks", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());

        // The SQL editor initializes asynchronously (lazy Monaco import), and a
        // real user cannot type before it is ready. Wait for the live editor to
        // finish loading so keystrokes reach the panel's draft wiring rather
        // than a stale or disposed model.
        async function waitForReadyEditor(): Promise<void> {
            await waitFor(
                () => {
                    expect(view.getByTestId("sql-catalog-editor")).toBeTruthy();
                    expect(view.queryByTestId("sql-catalog-editor-loading")).toBeNull();
                },
                { timeout: 10_000 },
            );
        }

        // Create with a distinctive multiline source typed into the real editor.
        await fireEvent.click(view.getByTestId("sql-catalog-new"));
        await waitForReadyEditor();
        const createdSource = "CREATE TYPE priority_level AS ENUM (\n  'high',\n  'medium',\n  'low'\n);";
        fakeMonacoRegistry.lastModel().type(createdSource);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-create"));

        // The mutation must carry the user's edited source over the
        // authenticated transport — not the panel's default declaration.
        await waitFor(() =>
            expect(
                observed.some(entry =>
                    entry.path === "/api/sql-catalog/apply" && entry.body.intent?.object?.source === createdSource
                ),
            ).toBe(true)
        );
        const createdId = observed
            .find(entry => entry.body.intent?.operation === "create")!.body.intent!.object!.id;
        expect(observed.every(entry => entry.authorization === TEST_AUTHORIZATION)).toBe(true);

        // Reload-backed list and detail show the persisted identity and source.
        await waitFor(() => expect(view.getByTestId("sql-catalog-detail")).toBeTruthy());
        await waitForReadyEditor();
        expect(view.getByTestId("sql-catalog-detail-name").textContent).toBe("priority_level");
        expect(view.getAllByTestId("sql-catalog-name").map(entry => entry.textContent)).toEqual(["priority_level"]);
        expect(view.queryByTestId("sql-catalog-unsupported")).toBeNull();
        expect(view.container.querySelector("[data-object-id]")?.getAttribute("data-object-id")).toBe(createdId);
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(createdSource);

        await fireEvent.click(view.getByTestId("sql-catalog-refresh"));
        await waitFor(() =>
            expect(
                view.getAllByTestId("sql-catalog-name").map(entry => entry.textContent),
            ).toEqual(["priority_level"])
        );
        await waitForReadyEditor();

        // Edit through the same editor and verify the persisted readback.
        await fireEvent.click(view.getByTestId("sql-catalog-edit"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-save")).toBeTruthy());
        await waitForReadyEditor();
        const editedSource = "CREATE TYPE priority_level AS ENUM (\n  'urgent',\n  'high',\n  'medium',\n  'low'\n);";
        fakeMonacoRegistry.lastModel().type(editedSource);
        await tick();
        await fireEvent.click(view.getByTestId("sql-catalog-save"));
        await waitFor(() =>
            expect(
                observed.some(entry =>
                    entry.body.intent?.operation === "replace" && entry.body.intent?.object?.source === editedSource
                ),
            ).toBe(true)
        );
        await waitForReadyEditor();
        await waitFor(() => expect(fakeMonacoRegistry.lastModel().getValue()).toBe(editedSource));
        expect(view.getByTestId("sql-catalog-detail-name").textContent).toBe("priority_level");

        // Confirmed deletion removes the declaration, persistently.
        await fireEvent.click(view.getByTestId("sql-catalog-delete"));
        await fireEvent.click(view.getByTestId("sql-catalog-confirm-delete"));
        await waitFor(() => expect(observed.some(entry => entry.body.intent?.operation === "delete")).toBe(true));
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        await fireEvent.click(view.getByTestId("sql-catalog-refresh"));
        await waitFor(() => expect(view.getByTestId("sql-catalog-empty")).toBeTruthy());
        expect(view.queryAllByTestId("sql-catalog-item")).toHaveLength(0);

        view.unmount();
    });
});
