import { Project } from "$shared/app-schema";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { store } from "../../stores/store.svelte";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridHandles, getGridRegistry, setGridInsertTargetTableId } from "../yjstable/gridDocs";
import { createGridInsertController } from "../yjstable/gridInsertController";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { createTable, getTableHandles, setSchemaText } from "../yjstable/tableDocs";
import { resetTableEngineForTests } from "../yjstable/tableEngine";
import { deleteObject, getObjects } from "./objectManagerController";

afterEach(async () => {
    globalUndoRouter.clear();
    await resetTableEngineForTests();
});
afterAll(async () => await resetPgliteForTests());

describe("Object Manager Grid INSERT preference history", { timeout: 60_000 }, () => {
    it.each([true, false])("restores one deletion operation with explicit preference=%s", async configured => {
        const project = Project.createInstance("Grid preference lifecycle");
        store.project = project;
        const tables = ["a", "b"].map(name => {
            const id = createTable(project.ydoc, name, name);
            const handles = getTableHandles(project.ydoc, id)!;
            setSchemaText(handles, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, title TEXT DEFAULT '${name}')`);
            return handles;
        });
        const query = "SELECT id AS id, title AS title FROM a UNION ALL SELECT id AS id, title AS title FROM b";
        const gridId = createGrid(project.ydoc, {
            name: "Restored destination",
            query,
            columnOrder: ["title", "id"],
            components: { title: { type: "text", label: "Task title", widthPx: 220 }, id: { hidden: true } },
        });
        const grid = getGridHandles(project.ydoc, gridId)!;
        const page = project.addPage("Dashboard", "test");
        const item = page.items.addNode("test");
        const placement = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
        project.ydoc.transact(() => {
            placement.set("componentType", "yjstable");
            placement.set("yjsGridId", gridId);
        });
        const controller = createGridInsertController({
            projectDoc: project.ydoc,
            gridEntry: grid.entry,
            query,
            connect: async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} }),
            onPreferenceChange: id => setGridInsertTargetTableId(grid, id),
        });
        try {
            await expect.poll(() => controller.state.resolution?.mode, { timeout: 30_000 }).toBe("selection-required");
            expect(grid.entry.has("sourceTableId")).toBe(false);
            expect(grid.entry.has("insertTargetTableId")).toBe(false);
            if (configured) expect(await controller.savePreference(tables[1]!.tableId)).toBeUndefined();
            const expected = grid.entry.toJSON();
            const beforeTables = tables.map(table => ({
                data: table.data.toJSON(),
                undo: table.undo.undoStack.length,
                redo: table.undo.redoStack.length,
            }));
            let recordMutations = 0;
            for (const table of tables) table.data.observeDeep(() => recordMutations++);
            const object = getObjects(project).find(object => object.id === gridId && object.type === "Grid")!;
            expect(object.placements).toHaveLength(1);
            expect(deleteObject(project, object, { projectAccess: true, surfaceWritable: true })).toBe(true);
            const assertDeleted = () => {
                expect(getGridRegistry(project.ydoc).has(gridId)).toBe(false);
                expect(placement.get("yjsGridId")).toBeUndefined();
                expect(placement.get("componentType")).toBeUndefined();
            };
            const assertRestored = () => {
                const restored = getGridRegistry(project.ydoc).get(gridId)!;
                expect(restored?.toJSON()).toEqual(expected);
                expect(restored.has("insertTargetTableId")).toBe(configured);
                expect(restored.has("sourceTableId")).toBe(false);
                expect(placement.get("yjsGridId")).toBe(gridId);
                expect(placement.get("componentType")).toBe("yjstable");
            };
            assertDeleted();
            await globalUndoRouter.undo();
            assertRestored();
            await globalUndoRouter.redo();
            assertDeleted();
            await globalUndoRouter.undo();
            assertRestored();
            expect(recordMutations).toBe(0);
            expect(
                tables.map(table => ({
                    data: table.data.toJSON(),
                    undo: table.undo.undoStack.length,
                    redo: table.undo.redoStack.length,
                })),
            ).toEqual(beforeTables);
        } finally {
            controller.dispose();
        }
    });
});
