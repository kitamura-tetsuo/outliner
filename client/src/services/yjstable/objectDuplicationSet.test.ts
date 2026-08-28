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
import { createGrid, getGridSourceTableId, listGrids } from "./gridDocs";
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
        const tableId = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, { name: "Board" });

        const preview = previewObjectSetDuplication(doc, [{ type: "grid", id: gridId }]);
        expect(preview.objects).toEqual([{ type: "grid", id: gridId }]);

        const result = await duplicateObjectSet(doc, doc, [{ type: "grid", id: gridId }]);
        expect(result.createdObjects).toEqual([{ type: "grid", id: result.idMap.get(`grid:${gridId}`) }]);
        expect(listGrids(doc)).toHaveLength(2);
        expect(listTables(doc)).toHaveLength(1);
    });

    it("never pulls in a dependency neighbor that was not explicitly selected", async () => {
        const doc = new Y.Doc();
        const tableId = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId);

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
        const gridId = createGrid(doc, tasks, { name: "Board" });

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
        const gridId = createGrid(doc, tasks, { name: "Board" });

        const result = await duplicateObjectSet(doc, doc, [
            { type: "grid", id: gridId },
            { type: "table", id: tasks },
        ]);
        const copiedGridId = result.idMap.get(`grid:${gridId}`)!;
        const copiedTableId = result.idMap.get(`table:${tasks}`)!;
        expect(getGridSourceTableId(doc, copiedGridId)).toBe(copiedTableId);
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
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tasks, { name: "Board" });

        // Only the Grid is selected; the Table it points at is not.
        const result = await duplicateObjectSet(doc, doc, [{ type: "grid", id: gridId }]);
        const copiedGridId = result.idMap.get(`grid:${gridId}`)!;
        expect(getGridSourceTableId(doc, copiedGridId)).toBe(tasks);
        expect(result.removedReferenceCount).toBe(0);
    });

    it("clears and warns about a cross-project reference to an unselected object", async () => {
        const source = new Y.Doc();
        const tasks = table(source, "Tasks", "tasks");
        const gridId = createGrid(source, tasks, { name: "Board" });

        const preview = previewObjectSetDuplication(source, [{ type: "grid", id: gridId }]);
        expect(preview.omittedReferenceCount).toBe(1);

        const destination = new Y.Doc();
        const result = await duplicateObjectSet(source, destination, [{ type: "grid", id: gridId }]);
        const copiedGridId = result.idMap.get(`grid:${gridId}`)!;
        expect(getGridSourceTableId(destination, copiedGridId)).toBeUndefined();
        expect(result.removedReferenceCount).toBe(1);
        // The unselected Table itself must never be silently copied too.
        expect(listTables(destination)).toHaveLength(0);
    });

    it("copies a shared dependency exactly once when reachable from two selected roots", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const first = createGrid(doc, tasks, { name: "First" });
        const second = createGrid(doc, tasks, { name: "Second" });

        const result = await duplicateObjectSet(doc, doc, [
            { type: "grid", id: first },
            { type: "grid", id: second },
            { type: "table", id: tasks },
        ]);
        expect(result.createdObjects.filter(o => o.type === "table")).toHaveLength(1);
        expect(result.createdObjects.filter(o => o.type === "grid")).toHaveLength(2);
        const copiedTableId = result.idMap.get(`table:${tasks}`)!;
        for (const gridId of [result.idMap.get(`grid:${first}`), result.idMap.get(`grid:${second}`)]) {
            expect(getGridSourceTableId(doc, gridId!)).toBe(copiedTableId);
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
        const gridId = createGrid(doc, tasks, { name: "Board" });

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
});
