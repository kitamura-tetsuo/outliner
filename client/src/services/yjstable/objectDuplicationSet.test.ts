// Explicit-selection duplication (issue #5153): Object Manager's
// `Duplicate selected` treats the current selection as the authoritative
// duplication scope and never expands it through the dependency graph —
// unlike `duplicateObjects`/`previewObjectDuplication`, which this file does
// not re-test (see objectDuplication.test.ts / objectDuplication.calendar.test.ts).
import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { type CalendarSettings, createCalendar, getCalendar } from "../calendar/calendarService";
import { createScheduleRule, type ScheduleRule } from "../schedule/scheduleRuleService";
import { createGrid, getGridHandles, getGridRegistry, listGrids } from "./gridDocs";
import { duplicateObjectSet, previewObjectSetDuplication } from "./objectDuplication";
import { addRecord, createTable, getTableHandles, listTables } from "./tableDocs";

function table(doc: Y.Doc, name: string, sqlName: string): string {
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`);
    });
}

function schedule(doc: Y.Doc, targetTableId: string, sql: string, options: Partial<ScheduleRule> = {}): string {
    return createScheduleRule(Project.fromDoc(doc), { targetTableId, sql, rrule: "RRULE:FREQ=DAILY", ...options });
}

function calendar(doc: Y.Doc, name: string, query: string, extra: Partial<CalendarSettings> = {}): string {
    return createCalendar(Project.fromDoc(doc), { name, query, ...extra });
}

function scheduleRuleMap(doc: Y.Doc, ruleId: string): Y.Map<unknown> {
    return doc.getMap("schedules").get(ruleId) as Y.Map<unknown>;
}

describe("explicit-selection duplication (Duplicate selected)", () => {
    it("duplicates exactly one selected object and nothing else", async () => {
        const doc = new Y.Doc();
        table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, { name: "Board", query: "SELECT * FROM tasks" });

        const preview = previewObjectSetDuplication(doc, [{ type: "grid", id: gridId }]);
        expect(preview.objects).toEqual([{ type: "grid", id: gridId }]);

        const result = await duplicateObjectSet(doc, doc, [{ type: "grid", id: gridId }]);
        expect(result.createdObjects).toEqual([{ type: "grid", id: result.idMap.get(`grid:${gridId}`) }]);
        expect(listGrids(doc)).toHaveLength(2);
        expect(listTables(doc)).toHaveLength(1);
    });

    it("never pulls in a dependency neighbor that was not explicitly selected", async () => {
        const doc = new Y.Doc();
        table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, { query: "SELECT * FROM tasks" });

        // Selecting only the Grid must not behave like the recursive
        // "referenced" scope — the Table is left alone.
        const result = await duplicateObjectSet(doc, doc, [{ type: "grid", id: gridId }]);
        expect(result.createdObjects.every(o => o.type === "grid")).toBe(true);
        expect(listTables(doc)).toHaveLength(1);
    });

    it("duplicates every manually selected object, deduplicating repeats", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const owners = table(doc, "Owners", "owners");
        const gridId = createGrid(doc, { name: "Board", query: "SELECT * FROM tasks" });

        const selection = [
            { type: "table" as const, id: tasks },
            { type: "table" as const, id: owners },
            { type: "grid" as const, id: gridId },
            { type: "table" as const, id: tasks }, // repeated on purpose
        ];
        const preview = previewObjectSetDuplication(doc, selection);
        expect(preview.objects).toHaveLength(3);

        const result = await duplicateObjectSet(doc, doc, selection);
        expect(result.createdObjects).toHaveLength(3);
        expect(listTables(doc)).toHaveLength(4);
        expect(listGrids(doc)).toHaveLength(2);
    });

    it("rewrites a selected Grid's Table reference to the copied Table", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, { name: "Board", query: "SELECT * FROM tasks" });

        const result = await duplicateObjectSet(doc, doc, [
            { type: "grid", id: gridId },
            { type: "table", id: tasks },
        ]);
        const copiedGridId = result.idMap.get(`grid:${gridId}`)!;
        result.idMap.get(`table:${tasks}`)!;
        expect(getGridHandles(doc, copiedGridId)?.entry.get("query")).toBe("SELECT * FROM tasks_2");
    });

    it("keeps a joined-result alias while remapping its input qualifiers", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const notes = createTable(doc, "Notes", "notes", handles => {
            handles.schemaText.insert(0, "CREATE TABLE notes (id TEXT PRIMARY KEY, task_id TEXT)");
        });
        const query = "SELECT tasks.id AS id FROM (tasks JOIN notes ON tasks.id = notes.task_id) AS tasks";
        const gridId = createGrid(doc, { name: "Joined", query });

        const result = await duplicateObjectSet(doc, doc, [
            { type: "grid", id: gridId },
            { type: "table", id: tasks },
            { type: "table", id: notes },
        ]);

        const copiedGridId = result.idMap.get(`grid:${gridId}`)!;
        expect(getGridHandles(doc, copiedGridId)?.entry.get("query")).toBe(
            "SELECT tasks.id AS id FROM (tasks_2 JOIN notes_2 ON tasks_2.id = notes_2.task_id) AS tasks",
        );
    });

    it("rewrites a selected Schedule's target and SQL references to the copied Table", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const ruleId = schedule(doc, occurrences, "INSERT INTO occurrences (id) SELECT 1 RETURNING *");

        const result = await duplicateObjectSet(doc, doc, [
            { type: "schedule", id: ruleId },
            { type: "table", id: occurrences },
        ]);
        const copiedRuleId = result.idMap.get(`schedule:${ruleId}`)!;
        const copiedTableId = result.idMap.get(`table:${occurrences}`)!;
        const copiedSqlName = listTables(doc).find(t => t.tableId === copiedTableId)!.sqlName;
        const copiedRule = scheduleRuleMap(doc, copiedRuleId);
        expect(copiedRule.get("targetTableId")).toBe(copiedTableId);
        expect(copiedRule.get("sql")).toBe(`INSERT INTO ${copiedSqlName} (id) SELECT 1 RETURNING *`);
    });

    it("rewrites a Schedule DML target even when a CTE has the same name", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const ruleId = schedule(
            doc,
            tasks,
            "WITH tasks AS (SELECT 'new' AS id) INSERT INTO tasks (id) SELECT id FROM tasks RETURNING *",
        );
        const result = await duplicateObjectSet(doc, doc, [
            { type: "schedule", id: ruleId },
            { type: "table", id: tasks },
        ]);
        const copiedRule = scheduleRuleMap(doc, result.idMap.get(`schedule:${ruleId}`)!);
        expect(copiedRule.get("sql")).toBe(
            "WITH tasks AS (SELECT 'new' AS id) INSERT INTO tasks_2 (id) SELECT id FROM tasks RETURNING *",
        );
    });

    it("rewrites a selected Calendar's query to the copied Table", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const calendarId = calendar(doc, "Team Calendar", "SELECT id FROM tasks");

        const result = await duplicateObjectSet(doc, doc, [
            { type: "calendar", id: calendarId },
            { type: "table", id: tasks },
        ]);
        const copiedCalendarId = result.idMap.get(`calendar:${calendarId}`)!;
        const copiedTableId = result.idMap.get(`table:${tasks}`)!;
        const copiedSqlName = listTables(doc).find(t => t.tableId === copiedTableId)!.sqlName;
        expect(getCalendar(Project.fromDoc(doc), copiedCalendarId)?.query).toBe(`SELECT id FROM ${copiedSqlName}`);
    });

    it("preserves a same-project reference to an unselected object", async () => {
        const doc = new Y.Doc();
        table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, { name: "Board", query: "SELECT * FROM tasks" });

        // Only the Grid is selected; the Table it points at is not.
        const result = await duplicateObjectSet(doc, doc, [{ type: "grid", id: gridId }]);
        const copiedGridId = result.idMap.get(`grid:${gridId}`)!;
        expect(getGridHandles(doc, copiedGridId)?.entry.get("query")).toBe("SELECT * FROM tasks");
        expect(result.removedReferenceCount).toBe(0);
    });

    it("clears and warns about a cross-project reference to an unselected object", async () => {
        const source = new Y.Doc();
        table(source, "Tasks", "tasks");
        const gridId = createGrid(source, { name: "Board", query: "SELECT * FROM tasks" });

        const preview = previewObjectSetDuplication(source, [{ type: "grid", id: gridId }]);
        expect(preview.omittedReferenceCount).toBe(1);

        const destination = new Y.Doc();
        const result = await duplicateObjectSet(source, destination, [{ type: "grid", id: gridId }]);
        const copiedGridId = result.idMap.get(`grid:${gridId}`)!;
        expect(getGridRegistry(destination).get(copiedGridId)?.get("sourceTableId")).toBeUndefined();
        expect(result.removedReferenceCount).toBe(1);
        // The unselected Table itself must never be silently copied too.
        expect(listTables(destination)).toHaveLength(0);
    });

    it("copies a shared dependency exactly once when reachable from two selected roots", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const first = createGrid(doc, { name: "First", query: "SELECT * FROM tasks" });
        const second = createGrid(doc, { name: "Second", query: "SELECT * FROM tasks" });

        const result = await duplicateObjectSet(doc, doc, [
            { type: "grid", id: first },
            { type: "grid", id: second },
            { type: "table", id: tasks },
        ]);
        expect(result.createdObjects.filter(o => o.type === "table")).toHaveLength(1);
        expect(result.createdObjects.filter(o => o.type === "grid")).toHaveLength(2);
        result.idMap.get(`table:${tasks}`)!;
        for (const gridId of [result.idMap.get(`grid:${first}`), result.idMap.get(`grid:${second}`)]) {
            expect(getGridHandles(doc, gridId!)?.entry.get("query")).toBe("SELECT * FROM tasks_2");
        }
    });

    it("applies the Table data-copy option to every selected Table", async () => {
        const source = new Y.Doc();
        const tasks = table(source, "Tasks", "tasks");
        const owners = table(source, "Owners", "owners");
        addRecord(getTableHandles(source, tasks)!, { title: "task-1" }, "row-1");
        addRecord(getTableHandles(source, owners)!, { title: "owner-1" }, "row-1");

        const destination = new Y.Doc();
        const result = await duplicateObjectSet(source, destination, [
            { type: "table", id: tasks },
            { type: "table", id: owners },
        ], { copyTableData: true });

        const copiedTasksId = result.idMap.get(`table:${tasks}`)!;
        const copiedOwnersId = result.idMap.get(`table:${owners}`)!;
        expect(getTableHandles(destination, copiedTasksId)?.data.get("row-1")?.get("title")).toBe("task-1");
        expect(getTableHandles(destination, copiedOwnersId)?.data.get("row-1")?.get("title")).toBe("owner-1");
    });

    it("rolls back every created object when materialization fails partway through", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, { name: "Board", query: "SELECT * FROM tasks" });

        await expect(
            duplicateObjectSet(doc, doc, [
                { type: "table", id: tasks },
                { type: "grid", id: gridId },
                { type: "grid", id: "missing-grid" },
            ]),
        ).rejects.toThrow();

        // The Table created before the failing Grid must not survive either.
        expect(listTables(doc)).toHaveLength(1);
        expect(listGrids(doc)).toHaveLength(1);
    });

    it("rejects invalid required Schedule SQL before publishing a selected Table", async () => {
        const source = new Y.Doc();
        const tasks = table(source, "Tasks", "tasks");
        const ruleId = schedule(source, tasks, "INSERT INTO tasks (id) VALUES ('1') RETURNING *");
        // A remote/legacy Yjs update can bypass the local creation validator;
        // duplication must therefore re-admit the persisted definition.
        scheduleRuleMap(source, ruleId).set("sql", "SELECT FROM");
        const destination = new Y.Doc();
        let tableEvents = 0;
        let scheduleEvents = 0;
        let updates = 0;
        destination.getMap("yjsTables").observe(() => tableEvents++);
        destination.getMap("schedules").observe(() => scheduleEvents++);
        destination.on("update", () => updates++);

        await expect(duplicateObjectSet(source, destination, [
            { type: "table", id: tasks },
            { type: "schedule", id: ruleId },
        ])).rejects.toThrow(/parsing failed/);
        expect({ tableEvents, scheduleEvents, updates }).toEqual({ tableEvents: 0, scheduleEvents: 0, updates: 0 });
    });
});
