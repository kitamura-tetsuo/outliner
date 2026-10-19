import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { Project } from "../../schema/app-schema";
import { createGrid, getGridHandles, getGridQuery, getGridSourceTableId } from "../../services/yjstable/gridDocs";
import { getItemGridId, getItemLegacyTableId } from "../../services/yjstable/itemBinding";
import { createTable } from "../../services/yjstable/tableDocs";
import { setPage } from "../../tests/mocks/appState.svelte";
import YjsTableBlock from "./YjsTableBlock.svelte";

vi.mock("$app/state", () => import("../../tests/mocks/appState.svelte"));
setPage({ params: { project: "test-project" } });

describe("YjsTableBlock query-only placement", () => {
    it("places an existing query-only Grid without changing its definition", async () => {
        const project = Project.createInstance("Query Grid placement");
        const page = project.addPage("Page", "tester");
        const host = page.items.addNode("tester");
        host.componentType = "yjstable";
        const gridId = createGrid(project.ydoc, undefined, {
            name: "Independent",
            query: "SELECT 1 AS value",
        });

        const rendered = render(YjsTableBlock, { props: { item: host } });
        await fireEvent.click(rendered.getByRole("button", { name: "Existing Grid" }));
        await fireEvent.click(rendered.getByTestId("yjs-grid-select-existing"));

        await waitFor(() => expect(getItemGridId(host)).toBe(gridId));
        expect(getItemLegacyTableId(host)).toBeUndefined();
        expect(getGridQuery(getGridHandles(project.ydoc, gridId)!)).toBe("SELECT 1 AS value");
        expect(getGridSourceTableId(project.ydoc, gridId)).toBeUndefined();
    });

    it("uses a selected Table only to seed the new Grid query", async () => {
        const project = Project.createInstance("Independent Grid creation");
        const page = project.addPage("Page", "tester");
        const host = page.items.addNode("tester");
        host.componentType = "yjstable";
        createTable(project.ydoc, "People", "current_people");

        const rendered = render(YjsTableBlock, { props: { item: host } });
        await fireEvent.click(rendered.getByRole("button", { name: "New Grid over Existing Table" }));
        await fireEvent.click(rendered.getByTestId("yjs-table-select-existing"));

        const gridId = getItemGridId(host);
        expect(gridId).toBeDefined();
        expect(getItemLegacyTableId(host)).toBeUndefined();
        expect(getGridSourceTableId(project.ydoc, gridId!)).toBeUndefined();
        expect(getGridQuery(getGridHandles(project.ydoc, gridId!)!)).toBe("SELECT * FROM current_people");
    });
});
