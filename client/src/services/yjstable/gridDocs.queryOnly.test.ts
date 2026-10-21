import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import {
    createGrid,
    duplicateGrid,
    getGridHandles,
    getGridRegistry,
    getGridSourceTableId,
    listGrids,
    removeGridWithPlacements,
} from "./gridDocs";
import { appendGridPlacement } from "./gridPlacement";

describe("query-only Grid definitions", () => {
    it("retains identity and presentation without synthesizing a primary Table", () => {
        const doc = new Y.Doc();
        const gridId = createGrid(doc, undefined, {
            gridId: "query-grid",
            name: "Independent query",
            query: "SELECT 1 AS value",
            columnOrder: ["value"],
            components: { value: { label: "Result", widthPx: 180 } },
        });

        const handles = getGridHandles(doc, gridId);
        expect(gridId).toBe("query-grid");
        expect(getGridSourceTableId(doc, gridId)).toBeUndefined();
        expect(handles?.entry.has("sourceTableId")).toBe(false);
        expect(handles?.entry.get("query")).toBe("SELECT 1 AS value");
        expect(listGrids(doc)).toEqual([{
            gridId,
            name: "Independent query",
            sourceTableId: undefined,
            showAddRowButton: true,
            confirmRowDelete: false,
        }]);
    });
});

it("duplicates an independent Grid with all saved settings and no primary field", () => {
    const doc = new Y.Doc();
    const id = createGrid(doc, undefined, {
        query: "SELECT 1 AS value",
        insertTargetTableId: "stale-preference",
        showAddRowButton: false,
        confirmRowDelete: true,
        components: { value: { label: "Value", widthPx: 90 } },
        columnOrder: ["value"],
    });
    const copied = duplicateGrid(doc, id)!;
    expect(copied).not.toBe(id);
    const original = getGridRegistry(doc).get(id)!.toJSON();
    expect(getGridRegistry(doc).get(copied)!.toJSON()).toEqual({ ...original, name: "Grid (copy)" });
    expect(getGridRegistry(doc).get(copied)!.has("sourceTableId")).toBe(false);
});

it("explicit deletion and Undo preserve a placement rebound to another Grid", () => {
    globalUndoRouter.clear();
    const project = Project.createInstance("Lifecycle");
    const page = project.addPage("Page", "author");
    const id = createGrid(project.ydoc, undefined, {
        query: "SELECT 1 AS value",
        showAddRowButton: false,
        confirmRowDelete: true,
    });
    const peer = createGrid(project.ydoc, undefined, { query: "SELECT 2 AS value" });
    const placement = appendGridPlacement(project.ydoc, page.id, id, "author");
    const value = project.tree.getNodeValueFromKey(placement.key) as Y.Map<unknown>;
    expect(value.has("yjsTableId")).toBe(false);
    expect(removeGridWithPlacements(project, id)).toBe(true);
    project.ydoc.transact(() => {
        value.set("componentType", "yjstable");
        value.set("yjsGridId", peer);
    }, "peer");
    globalUndoRouter.undo();
    expect(value.get("yjsGridId")).toBe(peer);
    expect(getGridRegistry(project.ydoc).get(id)?.get("showAddRowButton")).toBe(false);
    expect(getGridRegistry(project.ydoc).get(id)?.get("confirmRowDelete")).toBe(true);
    globalUndoRouter.redo();
    expect(value.get("yjsGridId")).toBe(peer);
    expect(getGridRegistry(project.ydoc).has(id)).toBe(false);
});
