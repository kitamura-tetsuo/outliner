import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import SqlCatalogPanel from "./SqlCatalogPanel.svelte";

vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then(module => module.fakeMonaco),
}));

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => ({ id: "test-user", name: "Test User", email: "test@example.com" }),
        auth: { currentUser: { getIdToken: async () => "test-token" } },
    },
}));

const objects = [
    {
        id: "valid-unicode",
        kind: "enum",
        source: "/* outer /* nested */ comment */ CREATE TYPE 状態 AS ENUM ('open;now', E'line\\nfeed')",
    },
    {
        id: "valid-quoted",
        kind: "enum",
        source: 'CREATE TYPE "My ""Mood""" AS ENUM (\'happy; yes\')',
    },
    { id: "valid-empty", kind: "enum", source: "CREATE TYPE empty_mood AS ENUM ()" },
    { id: "malformed", kind: "enum", source: "CREATE TYPE mood AS ENUM ('happy'" },
    { id: "multiple", kind: "enum", source: "CREATE TYPE a AS ENUM ('x'); SELECT 1" },
    { id: "qualified", kind: "enum", source: "CREATE TYPE public.mood AS ENUM ('happy')" },
    { id: "wrong-statement", kind: "enum", source: "CREATE TABLE mood (value text)" },
    { id: "wrong-kind", kind: "table", source: "CREATE TYPE apparent AS ENUM ('value')" },
];

describe("SqlCatalogPanel source classification", () => {
    const requests: { method: string; path: string; }[] = [];

    beforeEach(() => {
        requests.length = 0;
        fakeMonacoRegistry.reset();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string, init?: { method?: string; }) => {
                const url = new URL(input, "http://127.0.0.1:7093");
                requests.push({ method: init?.method ?? "GET", path: url.pathname });
                return {
                    ok: true,
                    status: 200,
                    statusText: "OK",
                    json: async () => ({
                        snapshot: { projectId: "demo-project", format: 1, objects, revision: "rev-1" },
                    }),
                };
            }),
        );
    });

    afterEach(() => vi.unstubAllGlobals());

    it("renders parser-resolved names and unsupported markers without mutating the catalog", async () => {
        const view = render(SqlCatalogPanel, { props: { projectId: "demo-project" } });
        await waitFor(() => expect(view.getAllByTestId("sql-catalog-item")).toHaveLength(objects.length));

        expect(view.getAllByTestId("sql-catalog-name").map(node => node.textContent)).toEqual([
            "状態",
            'My "Mood"',
            "empty_mood",
            "(unsupported source)",
            "(unsupported source)",
            "(unsupported source)",
            "(unsupported source)",
            "apparent",
        ]);
        expect(view.getAllByTestId("sql-catalog-unsupported")).toHaveLength(5);

        const items = view.getAllByTestId("sql-catalog-item");
        await fireEvent.click(items[0]);
        expect(view.getByTestId("sql-catalog-detail-name").textContent).toBe("状態");
        expect(view.queryByTestId("sql-catalog-detail-unsupported")).toBeNull();

        await fireEvent.click(items[3]);
        expect(view.getByTestId("sql-catalog-detail-name").textContent).toBe("(unsupported source)");
        expect(view.getByTestId("sql-catalog-detail-unsupported")).toBeTruthy();

        await fireEvent.click(items[7]);
        expect(view.getByTestId("sql-catalog-detail-name").textContent).toBe("apparent");
        expect(view.getByTestId("sql-catalog-detail-unsupported")).toBeTruthy();

        expect(requests).toEqual([{ method: "GET", path: "/api/sql-catalog/read" }]);
        view.unmount();
    });
});
