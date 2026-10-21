import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Project } from "../../schema/app-schema";
import { createGrid, getGridHandles, getGridQuery, getGridRegistry } from "../../services/yjstable/gridDocs";
import { getItemGridId } from "../../services/yjstable/itemBinding";
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
        const gridId = createGrid(project.ydoc, {
            name: "Independent",
            query: "SELECT 1 AS value",
        });

        const rendered = render(YjsTableBlock, { props: { item: host } });
        await fireEvent.click(rendered.getByRole("button", { name: "Existing Grid" }));
        await fireEvent.click(rendered.getByTestId("yjs-grid-select-existing"));

        await waitFor(() => expect(getItemGridId(host)).toBe(gridId));
        expect((host.tree.getNodeValueFromKey(host.key) as Y.Map<unknown>).has("yjsTableId")).toBe(false);
        expect(getGridQuery(getGridHandles(project.ydoc, gridId)!)).toBe("SELECT 1 AS value");
        expect(getGridRegistry(project.ydoc).get(gridId)?.has("sourceTableId")).toBe(false);
        const restoredDoc = new Y.Doc();
        Y.applyUpdate(restoredDoc, Y.encodeStateAsUpdate(project.ydoc));
        const restored = Project.fromDoc(restoredDoc);
        const restoredPage = [...restored.items].find(item => item.id === page.id)!;
        const restoredHost = [...restoredPage.items].find(item => item.id === host.id)!;
        expect(getItemGridId(restoredHost)).toBe(gridId);
        expect((restoredHost.tree.getNodeValueFromKey(restoredHost.key) as Y.Map<unknown>).has("yjsTableId")).toBe(
            false,
        );
        expect(getGridRegistry(restoredDoc).get(gridId)!.toJSON()).toEqual(
            getGridRegistry(project.ydoc).get(gridId)!.toJSON(),
        );
        expect(getGridRegistry(restoredDoc).get(gridId)!.has("insertTargetTableId")).toBe(false);
        rendered.unmount();
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
        expect((host.tree.getNodeValueFromKey(host.key) as Y.Map<unknown>).has("yjsTableId")).toBe(false);
        expect(getGridRegistry(project.ydoc).get(gridId!)?.has("sourceTableId")).toBe(false);
        expect(getGridQuery(getGridHandles(project.ydoc, gridId!)!)).toBe("SELECT * FROM current_people");
        expect(getGridRegistry(project.ydoc).get(gridId!)!.has("insertTargetTableId")).toBe(false);
        rendered.unmount();
    });
});
