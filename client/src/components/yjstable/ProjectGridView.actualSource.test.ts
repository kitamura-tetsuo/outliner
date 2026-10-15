import { render, screen, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "../../services/yjstable/gridDocs";
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
});
