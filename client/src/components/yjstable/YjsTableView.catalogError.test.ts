import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import YjsTableView from "./YjsTableView.svelte";

// The UI Definition panel embeds Monaco; jsdom only needs the established
// editor test double and the catalog/materialization paths remain real.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then(module => module.fakeMonaco),
}));

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("saved Grid catalog errors", { timeout: 60_000 }, () => {
    it("shows a missing dependency and clears it only after reconstruction succeeds", async () => {
        const projectId = "grid-visible-catalog-error";
        const doc = new Y.Doc({ guid: projectId });
        const catalog = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const objectId = createSqlCatalogObject(catalog, "enum", "CREATE TYPE other_state AS ENUM ('Open')");
        const tableId = createTable(doc, "Tasks", "tasks");
        const table = getTableHandles(doc, tableId)!;
        setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        const gridId = createGrid(doc, tableId, { query: "SELECT id, state FROM tasks" });
        const component = render(YjsTableView, {
            props: {
                grid: getGridHandles(doc, gridId)!,
                handles: table,
                projectDoc: doc,
                tableName: "Tasks",
                sqlName: "tasks",
            },
        });

        await waitFor(() => {
            expect(component.getByTestId("yjs-table-query-error").textContent).toMatch(/task_state|does not exist/i);
        }, { timeout: 30_000 });
        replaceSqlCatalogSource(catalog, objectId, "CREATE TYPE task_state AS ENUM ('Open')");
        await waitFor(() => expect(component.queryByTestId("yjs-table-query-error")).toBeNull(), {
            timeout: 30_000,
        });
        component.unmount();
    });
});
