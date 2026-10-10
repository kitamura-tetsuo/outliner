import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
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
});
