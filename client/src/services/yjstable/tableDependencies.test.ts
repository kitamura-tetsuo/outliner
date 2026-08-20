import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Project } from "../../../../shared/src/app-schema";
import { createGrid, listGrids } from "./gridDocs";
import { getTableDependencies, removeTableWithPolicy } from "./tableDependencies";
import { createTable, getTableRegistry } from "./tableDocs";

describe("tableDependencies", () => {
    it("finds direct grid references", () => {
        const project = Project.createInstance("Test");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, tableId, { name: "G", query: "SELECT * FROM t" });

        const page = project.addPage("Page 1", "test");
        const item1 = page.items.addNode("test");

        project.ydoc.transact(() => {
            const nodeValue = item1.tree.getNodeValueFromKey(item1.key) as Y.Map<unknown>;
            nodeValue.set("componentType", "yjstable");
            nodeValue.set("yjsGridId", gridId);
        });

        const deps = getTableDependencies(project, tableId);
        expect(deps.directGridReferences).toHaveLength(1);
        expect(deps.directGridReferences[0].pageId).toBe(page.id);
        expect(deps.directGridReferences[0].itemId).toBe(item1.id);
        expect(deps.directGridReferences[0].gridId).toBe(gridId);
        expect(deps.dependentGridIds).toEqual([gridId]);
    });

    it("removes table keeping references", () => {
        const project = Project.createInstance("Test");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, tableId, { name: "G" });

        const page = project.addPage("Page 1", "test");
        const item1 = page.items.addNode("test");

        let nodeValue: Y.Map<unknown>;
        project.ydoc.transact(() => {
            nodeValue = item1.tree.getNodeValueFromKey(item1.key) as Y.Map<unknown>;
            nodeValue.set("componentType", "yjstable");
            nodeValue.set("yjsGridId", gridId);
        });

        const res = removeTableWithPolicy(project, tableId, "keep-references");
        expect(res?.detachedGridCount).toBe(0);
        expect(res?.deletedGridCount).toBe(0);

        // Registry entry gone
        expect(getTableRegistry(project.ydoc).has(tableId)).toBe(false);
        // Direct reference remains; the Grid definition also remains but is
        // now orphaned (its source Table has been deleted).
        expect(nodeValue!.get("componentType")).toBe("yjstable");
        expect(nodeValue!.get("yjsGridId")).toBe(gridId);
        expect(listGrids(project.ydoc).map(g => g.gridId)).toContain(gridId);
    });

    it("removes table removing direct references", () => {
        const project = Project.createInstance("Test");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, tableId, { name: "G" });

        const page = project.addPage("Page 1", "test");
        const item1 = page.items.addNode("test");

        let nodeValue: Y.Map<unknown>;
        project.ydoc.transact(() => {
            nodeValue = item1.tree.getNodeValueFromKey(item1.key) as Y.Map<unknown>;
            nodeValue.set("componentType", "yjstable");
            nodeValue.set("yjsGridId", gridId);
        });

        const res = removeTableWithPolicy(project, tableId, "remove-direct-references");
        expect(res?.detachedGridCount).toBe(1);
        expect(res?.deletedGridCount).toBe(1);

        // Registry entry gone
        expect(getTableRegistry(project.ydoc).has(tableId)).toBe(false);
        // Direct reference detached
        expect(nodeValue!.get("componentType")).toBeUndefined();
        expect(nodeValue!.get("yjsGridId")).toBeUndefined();
        // The Grid definition has also been removed together with the Table.
        expect(listGrids(project.ydoc)).toEqual([]);
    });
});
