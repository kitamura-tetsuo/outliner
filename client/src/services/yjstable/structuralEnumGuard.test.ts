import { Project } from "$shared/app-schema";
import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { duplicateSelectedObjects, getObjects } from "../objectManager/objectManagerController";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid } from "./gridDocs";
import { duplicateObjects } from "./objectDuplication";
import { createTable, getTableHandles, listTables } from "./tableDocs";

function typedProject(
    guid: string,
    labels: string[],
): { doc: Y.Doc; tableId: string; gridId: string; enumId: string; } {
    const doc = new Y.Doc({ guid });
    const enumId = createSqlCatalogObject(
        doc,
        "enum",
        `CREATE TYPE task_state AS ENUM (${labels.map(label => `'${label.replaceAll("'", "''")}'`).join(", ")})`,
    );
    const tableId = createTable(doc, "Tasks", "tasks", handles => {
        handles.schemaText.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        const row = new Y.Map<string>();
        row.set("id", "one");
        row.set("state", labels[0]);
        handles.data.set("one", row);
    });
    const gridId = createGrid(doc, tableId, { query: "SELECT * FROM tasks ORDER BY state::task_state" });
    return { doc, tableId, gridId, enumId };
}

describe("structural ENUM compatibility guard", { timeout: 60_000 }, () => {
    it("refuses missing or differently ordered destination definitions before publication", async () => {
        const source = typedProject("enum-source", ["Open", " Done "]);
        const missing = new Y.Doc({ guid: "enum-missing" });

        await expect(duplicateObjects(source.doc, missing, { type: "grid", id: source.gridId }, "referenced"))
            .rejects.toThrow('Required ENUM type "task_state" is missing or incompatible');
        expect(listTables(missing)).toEqual([]);

        const incompatible = typedProject("enum-incompatible", [" Done ", "Open"]);
        const before = listTables(incompatible.doc).map(table => table.tableId);
        await expect(
            duplicateObjects(source.doc, incompatible.doc, { type: "grid", id: source.gridId }, "referenced"),
        ).rejects.toThrow('Required ENUM type "task_state" is missing or incompatible');
        expect(listTables(incompatible.doc).map(table => table.tableId)).toEqual(before);
    });

    it("accepts exact labels despite different application identity and refuses stale captured evidence", async () => {
        const source = typedProject("enum-compatible-source", ["Open", " Done "]);
        const destination = typedProject("enum-compatible-destination", ["Open", " Done "]);
        const result = await duplicateObjects(
            source.doc,
            destination.doc,
            { type: "table", id: source.tableId },
            "item-only",
            { copyTableData: true },
        );
        expect(getTableHandles(destination.doc, result.primaryId)?.data.get("one")?.get("state")).toBe("Open");

        replaceSqlCatalogSource(
            destination.doc,
            destination.enumId,
            "CREATE TYPE task_state AS ENUM ('Closed', 'Open')",
        );
        await expect(duplicateObjects(source.doc, destination.doc, { type: "table", id: source.tableId }, "item-only"))
            .rejects.toThrow('Required ENUM type "task_state" is missing or incompatible');
    });

    it("does not consume guarded redo when destination meaning changed", async () => {
        globalUndoRouter.clear();
        const source = typedProject("enum-redo-source", ["Open", "Closed"]);
        const destination = typedProject("enum-redo-destination", ["Open", "Closed"]);
        const selected = getObjects(Project.fromDoc(source.doc)).filter(object => object.id === source.tableId);
        const result = await duplicateSelectedObjects(source.doc, destination.doc, selected, { copyTableData: true });
        expect(result).not.toBeNull();

        globalUndoRouter.undo();
        await expect.poll(() => globalUndoRouter.isPending, { timeout: 30_000 }).toBe(false);
        expect(listTables(destination.doc)).toHaveLength(1);
        const redoDepth = globalUndoRouter.redoDepth;
        const undoDepth = globalUndoRouter.undoDepth;
        replaceSqlCatalogSource(
            destination.doc,
            destination.enumId,
            "CREATE TYPE task_state AS ENUM ('Closed', 'Open')",
        );

        globalUndoRouter.redo();
        await expect.poll(() => globalUndoRouter.isPending, { timeout: 30_000 }).toBe(false);
        expect(globalUndoRouter.lastAsyncOutcome?.status).toBe("refused");
        expect(globalUndoRouter.redoDepth).toBe(redoDepth);
        expect(globalUndoRouter.undoDepth).toBe(undoDepth);
        expect(listTables(destination.doc)).toHaveLength(1);
    });

    it("keeps plain TEXT duplication independent of unrelated invalid catalog source", async () => {
        const plain = new Y.Doc({ guid: "plain-with-unrelated-catalog" });
        createSqlCatalogObject(plain, "enum", "this is not a catalog declaration");
        const tableId = createTable(plain, "Notes", "notes", undefined, handles => {
            handles.schemaText.insert(0, "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)");
            const row = new Y.Map<string>();
            row.set("id", "one");
            row.set("body", "unchanged");
            handles.data.set("one", row);
        });

        const result = await duplicateObjects(plain, plain, { type: "table", id: tableId }, "item-only", {
            copyTableData: true,
        });
        expect(listTables(plain)).toHaveLength(2);
        expect(getTableHandles(plain, result.primaryId)?.data.get("one")?.get("body")).toBe("unchanged");
    });
});
