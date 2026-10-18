import { cleanup, render, waitFor } from "@testing-library/svelte";
import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridRegistry } from "../../services/yjstable/gridDocs";
import { createTable, setTableSqlName } from "../../services/yjstable/tableDocs";
import TableGridReferences from "./TableGridReferences.svelte";

afterEach(cleanup);
it("reacts to registered Table SQL-name changes and current Grid additions/removals", async () => {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "Orders", "orders");
    createTable(doc, "Tasks", "tasks");
    createGrid(doc, undefined, { gridId: "old", name: "Old name query", query: "SELECT * FROM orders" });
    createGrid(doc, undefined, { gridId: "next", name: "New name query", query: "SELECT * FROM renamed_orders" });
    createGrid(doc, undefined, { gridId: "other", name: "Unrelated", query: "SELECT * FROM tasks" });
    const view = render(TableGridReferences, { props: { projectDoc: doc, projectName: "demo", tableId } });
    await waitFor(() =>
        expect(view.getByRole("link", { name: "Old name query" })).toHaveAttribute("href", "/demo/-/grids/old")
    );
    expect(view.queryByText("New name query")).toBeNull();
    setTableSqlName(doc, tableId, "renamed_orders");
    await waitFor(() => expect(view.queryByText("Old name query")).toBeNull());
    expect(view.getByRole("link", { name: "New name query" })).toHaveAttribute("href", "/demo/-/grids/next");
    expect(view.queryByText("Unrelated")).toBeNull();
    createGrid(doc, undefined, { gridId: "added", name: "Added", query: "SELECT id FROM renamed_orders" });
    await waitFor(() =>
        expect(view.getByRole("link", { name: "Added" })).toHaveAttribute("href", "/demo/-/grids/added")
    );
    getGridRegistry(doc).delete("next");
    await waitFor(() => expect(view.queryByText("New name query")).toBeNull());
    expect(view.queryByTestId("yjs-table-view")).toBeNull();
    expect(getGridRegistry(doc).size).toBe(3);
    view.unmount();
    setTableSqlName(doc, tableId, "orders");
    doc.destroy();
});
