import { render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, setGridQuery } from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import ProjectGridView from "./ProjectGridView.svelte";

vi.mock("./YjsTableView.svelte", async () => {
    const Stub = (await import("../../routes/[project]/-/grids/[gridId]/__fixtures__/GridViewStub.svelte")).default;
    return { default: Stub };
});

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("ProjectGridView actual source", () => {
    it("mounts the rich Grid against the Table proven by the current SELECT", async () => {
        const projectDoc = new Y.Doc({ guid: "project-grid-actual-source" });
        const aId = createTable(projectDoc, "A", "a");
        const a = getTableHandles(projectDoc, aId)!;
        setSchemaText(a, "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)");
        addRecord(a, { value: "from-a" }, "same-id");
        const bId = createTable(projectDoc, "B", "b");
        const b = getTableHandles(projectDoc, bId)!;
        setSchemaText(b, "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)");
        addRecord(b, { value: "from-b" }, "same-id");
        const gridId = createGrid(projectDoc, undefined, {
            query: "SELECT id, value FROM b",
        });

        render(ProjectGridView, { props: { grid: getGridHandles(projectDoc, gridId)!, projectDoc } });

        await waitFor(
            () => expect(screen.getByTestId("grid-view-stub").getAttribute("data-source-table-id")).toBe(bId),
            { timeout: 10_000 },
        );
    });

    it("keeps mounted handles stable while a disappearing parent clears its derived Grid prop", async () => {
        const projectDoc = new Y.Doc({ guid: "project-grid-teardown" });
        const gridId = createGrid(projectDoc, undefined, { query: "SELECT 1 AS value" });
        const rendered = render(ProjectGridView, {
            props: { grid: getGridHandles(projectDoc, gridId)!, projectDoc },
        });

        await expect(rendered.rerender({ grid: undefined as never, projectDoc })).resolves.toBeUndefined();
        expect(screen.getByTestId("yjs-table-view").getAttribute("data-grid-id")).toBe(gridId);
    });

    it("keeps the rich selection surface for a multi-source readable result", async () => {
        const projectDoc = new Y.Doc({ guid: "project-grid-multi-source" });
        const aId = createTable(projectDoc, "A", "a");
        const a = getTableHandles(projectDoc, aId)!;
        setSchemaText(a, "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)");
        const bId = createTable(projectDoc, "B", "b");
        const b = getTableHandles(projectDoc, bId)!;
        setSchemaText(b, "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)");
        const gridId = createGrid(projectDoc, undefined, {
            query: "SELECT id, value FROM a UNION ALL SELECT id, value FROM b",
        });

        render(ProjectGridView, { props: { grid: getGridHandles(projectDoc, gridId)!, projectDoc } });

        await waitFor(
            () => expect(screen.getByTestId("grid-view-stub").getAttribute("data-source-table-id")).toBe(aId),
            { timeout: 10_000 },
        );
    });

    it("keeps the rich surface mounted while a changed query is evaluated", async () => {
        const projectDoc = new Y.Doc({ guid: "project-grid-refresh" });
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const table = getTableHandles(projectDoc, tableId)!;
        setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, value TEXT)");
        const gridId = createGrid(projectDoc, undefined, { query: "SELECT id, value FROM tasks" });
        const grid = getGridHandles(projectDoc, gridId)!;

        render(ProjectGridView, { props: { grid, projectDoc } });
        await waitFor(() => expect(screen.getByTestId("grid-view-stub")).toBeTruthy(), { timeout: 10_000 });

        setGridQuery(grid, "SELECT id, value || '!' AS value FROM tasks");
        await tick();

        expect(screen.getByTestId("grid-view-stub").getAttribute("data-source-table-id")).toBe(tableId);
    });
});
