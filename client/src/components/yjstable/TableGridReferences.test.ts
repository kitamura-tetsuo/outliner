import { cleanup, render, waitFor, within } from "@testing-library/svelte";
import { afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridRegistry } from "../../services/yjstable/gridDocs";
import { createTable, setTableSqlName } from "../../services/yjstable/tableDocs";
import TableGridReferences from "./TableGridReferences.svelte";

afterEach(cleanup);
it("reacts to Table identities and distinguishes incomplete SQL from empty reads", async () => {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "Orders", "orders");
    createGrid(doc, undefined, { gridId: "old", name: "Old query", query: "SELECT * FROM orders" });
    createGrid(doc, undefined, { gridId: "next", name: "New query", query: "SELECT * FROM renamed_orders" });
    const view = render(TableGridReferences, { props: { projectDoc: doc, projectName: "demo", tableId } });
    const known = () => within(view.container.querySelector(".reference-list") as HTMLElement);
    await waitFor(() =>
        expect(known().getByRole("link", { name: "Old query" })).toHaveAttribute("href", "/demo/-/grids/old")
    );
    expect(known().queryByText("New query")).toBeNull();
    expect(view.getByTestId("table-grid-references-unknown")).toHaveTextContent("uncertain");
    setTableSqlName(doc, tableId, "renamed_orders");
    await waitFor(() => expect(known().getByRole("link", { name: "New query" })).toBeVisible());
    expect(known().queryByText("Old query")).toBeNull();
    getGridRegistry(doc).delete("old");
    await waitFor(() => expect(view.queryByTestId("table-grid-references-unknown")).toBeNull());
    getGridRegistry(doc).get("next")!.set("query", "SELECT 1 AS value");
    await waitFor(() => expect(view.getByTestId("table-grid-references-empty")).toBeVisible());
    getGridRegistry(doc).get("next")!.set("query", "SELECT * FROM");
    await waitFor(() => expect(view.getByTestId("table-grid-references-unknown")).toBeVisible());
    expect(view.queryByTestId("table-grid-references-empty")).toBeNull();
});
