import { Project } from "$shared/app-schema";
import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCalendar } from "../calendar/calendarService";
import { serializeGridToHtml, serializeGridToTsv } from "../clipboard/gridClipboardExport";
import { exportProjectToMarkdown, exportProjectToOpml } from "../importExportService";
import { duplicateSelectedObjects, getObjects } from "../objectManager/objectManagerController";
import { createScheduleRule } from "../schedule/scheduleRuleService";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid } from "./gridDocs";
import { getGridSourceTableId, listGrids } from "./gridDocs";
import { appendGridPlacement } from "./gridPlacement";
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

    it("does not infer ENUM use from a column name or SQL string literal", async () => {
        for (const query of ["SELECT body FROM notes", "SELECT 'body' AS value FROM notes"]) {
            const plain = new Y.Doc({ guid: `plain-name-${query}` });
            createSqlCatalogObject(plain, "enum", "this is not a catalog declaration");
            createSqlCatalogObject(plain, "enum", "CREATE TYPE body AS ENUM ('x')");
            const tableId = createTable(plain, "Notes", "notes", undefined, handles => {
                handles.schemaText.insert(0, "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)");
            });
            createGrid(plain, tableId, { query });

            await expect(duplicateObjects(plain, plain, { type: "table", id: tableId }, "item-only"))
                .resolves.toBeDefined();
            expect(listTables(plain)).toHaveLength(2);
        }
    });

    it("preserves typed values in same-Project structural duplication", async () => {
        const source = typedProject("same-project-typed", ["Open", "Closed"]);
        const result = await duplicateObjects(
            source.doc,
            source.doc,
            { type: "table", id: source.tableId },
            "item-only",
            {
                copyTableData: true,
            },
        );
        expect(getTableHandles(source.doc, result.primaryId)?.data.get("one")?.get("state")).toBe("Open");
        expect(listTables(source.doc)).toHaveLength(2);
    });

    it("finds cast-only Grid, Calendar and Schedule dependencies over a TEXT table", async () => {
        const source = new Y.Doc({ guid: "cast-carriers" });
        createSqlCatalogObject(source, "enum", "CREATE TYPE task_state AS ENUM ('Open', 'Closed')");
        const tableId = createTable(source, "Tasks", "tasks", undefined, handles => {
            handles.schemaText.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state TEXT)");
        });
        const gridId = createGrid(source, tableId, { query: "SELECT * FROM tasks ORDER BY state::task_state" });
        const project = Project.fromDoc(source);
        const calendarId = createCalendar(project, {
            name: "Typed calendar",
            query: "SELECT id, state::task_state AS typed_state FROM tasks",
        });
        const scheduleId = createScheduleRule(project, {
            targetTableId: tableId,
            sql: "SELECT id FROM tasks ORDER BY state::task_state",
            rrule: "RRULE:FREQ=DAILY",
        });
        const destination = new Y.Doc({ guid: "cast-carriers-destination" });
        for (
            const object of [
                { type: "grid" as const, id: gridId },
                { type: "calendar" as const, id: calendarId },
                { type: "schedule" as const, id: scheduleId },
            ]
        ) {
            await expect(duplicateObjects(source, destination, object, "item-only"))
                .rejects.toThrow('Required ENUM type "task_state" is missing or incompatible');
        }
        expect(listTables(destination)).toEqual([]);
    });

    it("keeps ordinary text, HTML, TSV, Markdown and OPML exports catalog-independent", () => {
        const doc = new Y.Doc({ guid: "representation-exports" });
        createSqlCatalogObject(doc, "enum", "CREATE TYPE task_state AS ENUM ('Open', 'Closed')");
        const project = Project.fromDoc(doc);
        const page = project.addPage("Exports", "test");
        const item = page.items.addNode("test");
        item.updateText("Open");
        const config = {
            columns: ["state"],
            hiddenColumns: {},
            labels: { state: "State" },
            rows: [{ state: "Open" }],
        };

        expect(serializeGridToTsv(config).text).toBe("State\nOpen");
        expect(serializeGridToHtml(config).html).toContain("<td>Open</td>");
        expect(exportProjectToMarkdown(project)).toContain("Open");
        expect(exportProjectToOpml(project)).toContain('text="Open"');
    });

    it("refuses an unresolved typed schema instead of treating it as catalog-independent", async () => {
        for (const malformedCatalog of [false, true]) {
            const source = new Y.Doc({ guid: `unresolved-${String(malformedCatalog)}` });
            if (malformedCatalog) createSqlCatalogObject(source, "enum", "not a CREATE TYPE declaration");
            const tableId = createTable(source, "Tasks", "tasks", undefined, handles => {
                handles.schemaText.insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
            });
            const destination = new Y.Doc({ guid: `unresolved-destination-${String(malformedCatalog)}` });
            await expect(duplicateObjects(source, destination, { type: "table", id: tableId }, "item-only"))
                .rejects.toThrow('Required ENUM type "task_state" dependency evidence is unresolved');
            expect(listTables(destination)).toEqual([]);
        }
    });

    it("places another live same-Project view without cloning Table, Grid or catalog identity", () => {
        const source = typedProject("live-reference", ["Open", "Closed"]);
        const project = Project.fromDoc(source.doc);
        const first = project.addPage("First", "test");
        const second = project.addPage("Second", "test");
        appendGridPlacement(source.doc, first.id, source.gridId, "test");
        appendGridPlacement(source.doc, second.id, source.gridId, "test");

        expect(listTables(source.doc).map(table => table.tableId)).toEqual([source.tableId]);
        expect(listGrids(source.doc).map(grid => grid.gridId)).toEqual([source.gridId]);
        expect(getGridSourceTableId(source.doc, source.gridId)).toBe(source.tableId);
        expect(first.items.at(0)?.yjsGridId).toBe(source.gridId);
        expect(second.items.at(0)?.yjsGridId).toBe(source.gridId);
    });
});
