import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import {
    createGrid,
    duplicateGrid,
    getGridHandles,
    getGridRegistry,
    listGrids,
    removeGridWithPlacements,
} from "./gridDocs";
import { appendGridPlacement } from "./gridPlacement";

describe("query-only Grid definitions", () => {
    it("retains identity and presentation without synthesizing a primary Table", () => {
        const project = Project.createInstance("Round trip");
        const doc = project.ydoc;
        const page = project.addPage("Page", "author");
        const gridId = createGrid(doc, {
            gridId: "query-grid",
            name: "Independent query",
            query: "SELECT 1 AS value  /* exact SQL */",
            columnOrder: ["value"],
            components: { value: { type: "text", label: "Result", hidden: true, widthPx: 180 } },
            showAddRowButton: false,
            confirmRowDelete: true,
            insertTargetTableId: "explicit-choice",
        });

        const handles = getGridHandles(doc, gridId);
        expect(gridId).toBe("query-grid");
        expect(getGridRegistry(doc).get(gridId)?.has("sourceTableId")).toBe(false);
        expect(handles?.entry.has("sourceTableId")).toBe(false);
        expect(handles?.entry.get("query")).toBe("SELECT 1 AS value  /* exact SQL */");
        expect(listGrids(doc)).toEqual([{
            gridId,
            name: "Independent query",
            showAddRowButton: false,
            confirmRowDelete: true,
        }]);
        const placement = appendGridPlacement(doc, page.id, gridId, "author");
        placement.columnSpan = 5;
        const restoredDoc = new Y.Doc();
        Y.applyUpdate(restoredDoc, Y.encodeStateAsUpdate(doc));
        const restored = Project.fromDoc(restoredDoc);
        const restoredPage = [...restored.items].find(item => item.id === page.id)!;
        const restoredPlacement = [...restoredPage.items].find(item => item.id === placement.id)!;
        expect(restoredPlacement.yjsGridId).toBe(gridId);
        expect(restoredPlacement.columnSpan).toBe(5);
        expect((restoredPlacement.tree.getNodeValueFromKey(restoredPlacement.key) as Y.Map<unknown>).has("yjsTableId"))
            .toBe(false);
        const entry = getGridRegistry(restoredDoc).get(gridId)!;
        expect(entry.has("sourceTableId")).toBe(false);
        expect(entry.toJSON()).toEqual(handles!.entry.toJSON());
        expect(entry.get("insertTargetTableId")).toBe("explicit-choice");
    });
});

it("duplicates an independent Grid with all saved settings and no primary field", () => {
    const doc = new Y.Doc();
    const id = createGrid(doc, {
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
    const id = createGrid(project.ydoc, {
        query: "SELECT 1 AS value",
        showAddRowButton: false,
        confirmRowDelete: true,
    });
    const peer = createGrid(project.ydoc, { query: "SELECT 2 AS value" });
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
