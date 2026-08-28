import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createScheduleRule, type ScheduleRule, updateScheduleRule } from "../schedule/scheduleRuleService";
import { createGrid, getGridColumnOrder, getGridHandles, getGridSourceTableId, listGrids } from "./gridDocs";
import { duplicateObjects, previewObjectDuplication } from "./objectDuplication";
import { addRecord, createTable, getTableHandles, listTables } from "./tableDocs";

function table(doc: Y.Doc, name: string, sqlName: string): string {
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`);
    });
}

function schedule(
    doc: Y.Doc,
    targetTableId: string,
    sql: string,
    options: Partial<ScheduleRule> = {},
): string {
    return createScheduleRule(Project.fromDoc(doc), {
        targetTableId,
        sql,
        rrule: "RRULE:FREQ=DAILY",
        ...options,
    });
}

function scheduleRuleMap(doc: Y.Doc, ruleId: string): Y.Map<unknown> {
    return doc.getMap("schedules").get(ruleId) as Y.Map<unknown>;
}

describe("dependency-aware Grid/Table duplication", () => {
    it("collects recursively and deduplicates a shared Table", async () => {
        const doc = new Y.Doc();
        const tableId = table(doc, "Tasks", "tasks");
        const first = createGrid(doc, tableId, { name: "First" });
        createGrid(doc, tableId, { name: "Second" });

        const referenced = previewObjectDuplication(doc, { type: "grid", id: first }, "referenced");
        expect(referenced.objects).toEqual([
            { type: "grid", id: first },
            { type: "table", id: tableId },
        ]);
        const connected = previewObjectDuplication(doc, { type: "grid", id: first }, "connected");
        expect(connected.objects.filter(object => object.type === "table")).toHaveLength(1);
        expect(connected.objects.filter(object => object.type === "grid")).toHaveLength(2);
    });

    it("warns when a Grid's explicit Table reference is omitted", async () => {
        const doc = new Y.Doc();
        const tableId = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId);
        expect(previewObjectDuplication(doc, { type: "grid", id: gridId }, "item-only").omittedReferenceCount)
            .toBe(1);
    });

    it("collects and rewrites every Table relation referenced by a Grid query", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const owners = table(doc, "Owners", "owners");
        const gridId = createGrid(doc, tasks, {
            query: "SELECT tasks.id FROM tasks JOIN owners ON owners.id = tasks.id",
        });

        const preview = previewObjectDuplication(doc, { type: "grid", id: gridId }, "referenced");
        expect(preview.objects).toEqual([
            { type: "grid", id: gridId },
            { type: "table", id: tasks },
            { type: "table", id: owners },
        ]);
        const result = await duplicateObjects(doc, doc, { type: "grid", id: gridId }, "referenced");
        const query = String(getGridHandles(doc, result.primaryId)?.entry.get("query"));
        expect(query).toContain("FROM tasks_2 JOIN owners_2");
    });

    it("counts and clears omitted query relations in a cross-project copy", async () => {
        const source = new Y.Doc();
        const tasks = table(source, "Tasks", "tasks");
        table(source, "Owners", "owners");
        const gridId = createGrid(source, tasks, { query: "SELECT * FROM tasks JOIN owners USING (id)" });
        expect(previewObjectDuplication(source, { type: "grid", id: gridId }, "item-only").omittedReferenceCount)
            .toBe(2);

        const destination = new Y.Doc();
        const result = await duplicateObjects(source, destination, { type: "grid", id: gridId }, "item-only");
        expect(getGridHandles(destination, result.primaryId)?.entry.get("query")).toBe("");
        expect(result.removedReferenceCount).toBe(3);
    });

    it("preserves a Y.Array-backed Grid column order", async () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        const gridId = createGrid(source, tableId, { columnOrder: ["title", "id"] });
        const handles = getGridHandles(source, gridId)!;
        handles.entry.set("columnOrder", Y.Array.from(["id", "title"]));

        const result = await duplicateObjects(source, source, { type: "grid", id: gridId }, "item-only");
        expect(getGridColumnOrder(getGridHandles(source, result.primaryId)!)).toEqual(["id", "title"]);
    });

    it("keeps an omitted reference in-project and clears it cross-project", async () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        const gridId = createGrid(source, tableId);
        const local = await duplicateObjects(source, source, { type: "grid", id: gridId }, "item-only");
        expect(getGridSourceTableId(source, local.primaryId)).toBe(tableId);

        const destination = new Y.Doc();
        const remote = await duplicateObjects(source, destination, { type: "grid", id: gridId }, "item-only");
        expect(getGridSourceTableId(destination, remote.primaryId)).toBeUndefined();
        expect(remote.removedReferenceCount).toBe(1);
    });

    it("rewrites shared references and assigns collision-safe names", async () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        const first = createGrid(source, tableId, { name: "Board" });
        createGrid(source, tableId, { name: "Board copy" });
        const result = await duplicateObjects(source, source, { type: "grid", id: first }, "connected");
        const copiedTableId = result.idMap.get(`table:${tableId}`)!;
        const copiedGridIds = [...result.idMap].filter(([id]) => id.startsWith("grid:")).map(([, id]) => id);
        expect(copiedGridIds.map(id => getGridSourceTableId(source, id))).toEqual([copiedTableId, copiedTableId]);
        expect(listTables(source).map(entry => entry.name)).toContain("Tasks copy");
        expect(listGrids(source).map(entry => entry.name)).toContain("Board copy 2");
    });

    it("copies Table structure without rows by default and rows when requested", async () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        addRecord(getTableHandles(source, tableId)!, { title: "one" }, "row-1");

        const withoutRows = new Y.Doc();
        const structure = await duplicateObjects(source, withoutRows, { type: "table", id: tableId }, "item-only");
        expect(getTableHandles(withoutRows, structure.primaryId)?.data.size).toBe(0);

        const withRows = new Y.Doc();
        const data = await duplicateObjects(source, withRows, { type: "table", id: tableId }, "item-only", {
            copyTableData: true,
        });
        expect(getTableHandles(withRows, data.primaryId)?.data.get("row-1")?.get("title")).toBe("one");
    });
});

describe("cross-project duplication naming rules", () => {
    it("preserves object name on cross-project duplication", async () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");

        const destination = new Y.Doc();
        await duplicateObjects(source, destination, { type: "table", id: tableId }, "item-only");

        const tables = listTables(destination);
        expect(tables).toHaveLength(1);
        expect(tables[0].name).toBe("Tasks");
    });

    it("falls back to copy-style collision handling on cross-project duplication if name exists", async () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");

        const destination = new Y.Doc();
        table(destination, "Tasks", "tasks_dest");

        await duplicateObjects(source, destination, { type: "table", id: tableId }, "item-only");

        const tables = listTables(destination);
        expect(tables).toHaveLength(2);
        // "Tasks" and "Tasks copy"
        expect(tables.some(t => t.name === "Tasks copy")).toBe(true);
    });

    it("always appends 'copy' on same-project duplication", async () => {
        const doc = new Y.Doc();
        const tableId = table(doc, "Tasks", "tasks");

        await duplicateObjects(doc, doc, { type: "table", id: tableId }, "item-only");

        const tables = listTables(doc);
        expect(tables).toHaveLength(2);
        expect(tables.some(t => t.name === "Tasks copy")).toBe(true);
    });
});

describe("dependency-aware Schedule duplication", () => {
    it("collects a Schedule's write-target and SQL-referenced Tables recursively", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const templates = table(doc, "Templates", "templates");
        const ruleId = schedule(
            doc,
            occurrences,
            "INSERT INTO occurrences (id, title) SELECT id, title FROM templates RETURNING *",
        );

        const preview = previewObjectDuplication(doc, { type: "schedule", id: ruleId }, "referenced");
        expect(preview.objects).toEqual([
            { type: "schedule", id: ruleId },
            { type: "table", id: occurrences },
            { type: "table", id: templates },
        ]);
    });

    it("does not treat a column or alias that shadows a Table's SQL name as a dependency", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const tasks = table(doc, "Tasks", "tasks");
        // A Table happens to be named "status" too; the SQL only reads a
        // `status` *column* from `tasks`, never the `status` relation.
        const statusTable = table(doc, "Status", "status");
        const ruleId = schedule(doc, occurrences, "INSERT INTO occurrences (id) SELECT status FROM tasks RETURNING *");

        const preview = previewObjectDuplication(doc, { type: "schedule", id: ruleId }, "referenced");
        expect(preview.objects.filter(o => o.type === "table").map(o => o.id).sort())
            .toEqual([occurrences, tasks].sort());
        expect(preview.objects.some(o => o.type === "table" && o.id === statusTable)).toBe(false);
    });

    it("warns when a Schedule's Table references are omitted", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        table(doc, "Templates", "templates");
        const ruleId = schedule(doc, occurrences, "INSERT INTO occurrences (id) SELECT id FROM templates RETURNING *");
        expect(previewObjectDuplication(doc, { type: "schedule", id: ruleId }, "item-only").omittedReferenceCount)
            .toBe(2);
    });

    it("discovers a Schedule referencing a Table when duplicating from that Table's referencing scope", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const templates = table(doc, "Templates", "templates");
        const ruleId = schedule(doc, occurrences, "INSERT INTO occurrences (id) SELECT id FROM templates RETURNING *");

        expect(previewObjectDuplication(doc, { type: "table", id: occurrences }, "referencing").objects).toEqual([
            { type: "table", id: occurrences },
            { type: "schedule", id: ruleId },
        ]);
        expect(previewObjectDuplication(doc, { type: "table", id: templates }, "referencing").objects).toEqual([
            { type: "table", id: templates },
            { type: "schedule", id: ruleId },
        ]);
    });

    it("recursively pulls in every Table connected through a Schedule", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const templates = table(doc, "Templates", "templates");
        schedule(doc, occurrences, "INSERT INTO occurrences (id) SELECT id FROM templates RETURNING *");

        const connected = previewObjectDuplication(doc, { type: "table", id: templates }, "connected");
        expect(connected.objects.filter(o => o.type === "table").map(o => o.id).sort())
            .toEqual([occurrences, templates].sort());
        expect(connected.objects.filter(o => o.type === "schedule")).toHaveLength(1);
    });

    it("collects every Table a Schedule references, regardless of write-target or read role", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const templates = table(doc, "Templates", "templates");
        const owners = table(doc, "Owners", "owners");
        const ruleId = schedule(
            doc,
            occurrences,
            "INSERT INTO occurrences (id) SELECT t.id FROM templates t JOIN owners o ON o.id = t.id RETURNING *",
        );
        const preview = previewObjectDuplication(doc, { type: "schedule", id: ruleId }, "referenced");
        expect(preview.objects.filter(o => o.type === "table").map(o => o.id).sort())
            .toEqual([occurrences, owners, templates].sort());
    });

    it("dedups a Table shared between a Grid and a Schedule and terminates on a circular reference", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tasks, { name: "Board" });
        schedule(doc, tasks, "INSERT INTO tasks (id) SELECT id FROM tasks RETURNING *");

        const connected = previewObjectDuplication(doc, { type: "grid", id: gridId }, "connected");
        expect(connected.objects.filter(o => o.type === "table")).toHaveLength(1);
        expect(connected.objects.filter(o => o.type === "grid")).toHaveLength(1);
        expect(connected.objects.filter(o => o.type === "schedule")).toHaveLength(1);
    });

    it("rewrites a duplicated Schedule's target and SQL references to the copied Tables", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const templates = table(doc, "Templates", "templates");
        const ruleId = schedule(
            doc,
            occurrences,
            "INSERT INTO occurrences (id) SELECT id FROM templates RETURNING *",
            { name: "Daily import" },
        );

        const result = await duplicateObjects(doc, doc, { type: "schedule", id: ruleId }, "referenced");
        const copiedOccurrences = result.idMap.get(`table:${occurrences}`)!;
        const copiedTemplates = result.idMap.get(`table:${templates}`)!;
        const copiedOccurrencesSqlName = listTables(doc).find(t => t.tableId === copiedOccurrences)!.sqlName;
        const copiedTemplatesSqlName = listTables(doc).find(t => t.tableId === copiedTemplates)!.sqlName;

        const copiedRule = scheduleRuleMap(doc, result.primaryId);
        expect(copiedRule.get("targetTableId")).toBe(copiedOccurrences);
        expect(copiedRule.get("sql")).toBe(
            `INSERT INTO ${copiedOccurrencesSqlName} (id) SELECT id FROM ${copiedTemplatesSqlName} RETURNING *`,
        );
        expect(copiedRule.get("name")).toBe("Daily import copy");
    });

    it("keeps an out-of-scope Schedule reference in-project and clears it cross-project", async () => {
        const source = new Y.Doc();
        const occurrences = table(source, "Occurrences", "occurrences");
        const ruleId = schedule(source, occurrences, "INSERT INTO occurrences (id) SELECT 1 RETURNING *");

        const local = await duplicateObjects(source, source, { type: "schedule", id: ruleId }, "item-only");
        const localRule = scheduleRuleMap(source, local.primaryId);
        expect(localRule.get("targetTableId")).toBe(occurrences);
        expect(localRule.get("sql")).toBe("INSERT INTO occurrences (id) SELECT 1 RETURNING *");

        const destination = new Y.Doc();
        const remote = await duplicateObjects(source, destination, { type: "schedule", id: ruleId }, "item-only");
        const remoteRule = scheduleRuleMap(destination, remote.primaryId);
        expect(remoteRule.get("targetTableId")).toBe("");
        expect(remoteRule.get("sql")).toBe("");
        expect(remote.removedReferenceCount).toBe(2);
    });

    it("preserves enabled state for a same-project copy and forces a cross-project copy disabled", async () => {
        const source = new Y.Doc();
        const occurrences = table(source, "Occurrences", "occurrences");
        const ruleId = schedule(source, occurrences, "INSERT INTO occurrences (id) SELECT 1 RETURNING *", {
            enabled: true,
        });

        const local = await duplicateObjects(source, source, { type: "schedule", id: ruleId }, "referenced");
        expect(scheduleRuleMap(source, local.primaryId).get("enabled")).toBe(true);

        const destination = new Y.Doc();
        const remote = await duplicateObjects(source, destination, { type: "schedule", id: ruleId }, "referenced");
        expect(scheduleRuleMap(destination, remote.primaryId).get("enabled")).toBe(false);
    });

    it("does not copy runtime/execution state onto the duplicated Schedule", async () => {
        const source = new Y.Doc();
        const occurrences = table(source, "Occurrences", "occurrences");
        const ruleId = schedule(source, occurrences, "INSERT INTO occurrences (id) SELECT 1 RETURNING *", {
            lastRunAt: "2026-01-01T00:00:00.000Z",
            lastRunStatus: "ok",
            completedAt: "2026-01-01T00:05:00.000Z",
        });
        updateScheduleRule(Project.fromDoc(source), ruleId, { skippedOccurrences: 3, validationError: "bad sql" });

        const result = await duplicateObjects(source, source, { type: "schedule", id: ruleId }, "item-only");
        const copied = scheduleRuleMap(source, result.primaryId);
        expect(copied.get("lastRunAt")).toBeUndefined();
        expect(copied.get("lastRunStatus")).toBeUndefined();
        expect(copied.get("lastRunError")).toBeUndefined();
        expect(copied.get("completedAt")).toBeUndefined();
        expect(copied.get("skippedOccurrences")).toBeUndefined();
        expect(copied.get("validationError")).toBeUndefined();
    });

    it("assigns collision-safe copy names to duplicated Schedules", async () => {
        const doc = new Y.Doc();
        const occurrences = table(doc, "Occurrences", "occurrences");
        const ruleId = schedule(doc, occurrences, "INSERT INTO occurrences (id) SELECT 1 RETURNING *", {
            name: "Daily import",
        });
        schedule(doc, occurrences, "INSERT INTO occurrences (id) SELECT 2 RETURNING *", {
            name: "Daily import copy",
        });

        const first = await duplicateObjects(doc, doc, { type: "schedule", id: ruleId }, "item-only");
        expect(scheduleRuleMap(doc, first.primaryId).get("name")).toBe("Daily import copy 2");
    });

    it("references the newly created Table whether or not its data is copied", async () => {
        const source = new Y.Doc();
        const occurrences = table(source, "Occurrences", "occurrences");
        addRecord(getTableHandles(source, occurrences)!, { title: "one" }, "row-1");
        const ruleId = schedule(source, occurrences, "INSERT INTO occurrences (id) SELECT 1 RETURNING *");

        const withoutData = new Y.Doc();
        const noData = await duplicateObjects(source, withoutData, { type: "schedule", id: ruleId }, "referenced");
        const noDataTableId = noData.idMap.get(`table:${occurrences}`)!;
        expect(getTableHandles(withoutData, noDataTableId)?.data.size).toBe(0);
        expect(scheduleRuleMap(withoutData, noData.primaryId).get("targetTableId")).toBe(noDataTableId);

        const withData = new Y.Doc();
        const withDataResult = await duplicateObjects(
            source,
            withData,
            { type: "schedule", id: ruleId },
            "referenced",
            {
                copyTableData: true,
            },
        );
        const withDataTableId = withDataResult.idMap.get(`table:${occurrences}`)!;
        expect(getTableHandles(withData, withDataTableId)?.data.get("row-1")?.get("title")).toBe("one");
    });
});
