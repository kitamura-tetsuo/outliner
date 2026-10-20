import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCalendar } from "../calendar/calendarService";
import { createScheduleRule } from "../schedule/scheduleRuleService";
import { createGrid } from "../yjstable/gridDocs";
import { getTableDependencies } from "../yjstable/tableDependencies";
import { createTable } from "../yjstable/tableDocs";
import {
    buildObjectDependencyGraph,
    type GraphObject,
    objectGraphKey,
    traverseObjectGraph,
} from "./objectDependencyGraph";

function table(doc: Y.Doc, name: string, sqlName: string): string {
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`);
    });
}

function ids(objects: GraphObject[]): string[] {
    return objects.map(objectGraphKey).sort();
}

describe("buildObjectDependencyGraph", () => {
    it("reports colliding CTE scope as uncertainty in graph and Table usage", () => {
        const project = Project.createInstance("cte-usage");
        const x = table(project.ydoc, "Physical X", "x");
        const grid = createGrid(project.ydoc, undefined, { query: "WITH x AS (SELECT 1) SELECT * FROM x" });
        const graph = buildObjectDependencyGraph(project.ydoc);
        expect(graph.analysisOf({ type: "grid", id: grid })?.status).toBe("unknown");
        expect(graph.dependenciesOf({ type: "grid", id: grid })).toEqual([]);
        expect(getTableDependencies(project, x).unknownReferences.length).toBe(1);
        expect(getTableDependencies(project, x).dependentGridIds).toEqual([]);
    });

    it("records a Grid's SQL-derived Table dependencies, with the reverse edge on the Table", () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const owners = table(doc, "Owners", "owners");
        const gridId = createGrid(doc, undefined, {
            query: "SELECT id FROM tasks JOIN owners ON owners.id = tasks.id",
        });

        const graph = buildObjectDependencyGraph(doc);
        const gridObject: GraphObject = { type: "grid", id: gridId };
        expect(ids(graph.dependenciesOf(gridObject))).toEqual(ids([
            { type: "table", id: tasks },
            { type: "table", id: owners },
        ]));
        expect(graph.dependentsOf({ type: "table", id: tasks })).toContainEqual(gridObject);
        expect(graph.dependentsOf({ type: "table", id: owners })).toContainEqual(gridObject);
    });

    it("records a Schedule's write-target and SQL-referenced Table dependencies", () => {
        const doc = new Y.Doc();
        const project = Project.fromDoc(doc);
        const occurrences = table(doc, "Occurrences", "occurrences");
        const templates = table(doc, "Templates", "templates");
        const ruleId = createScheduleRule(project, {
            targetTableId: occurrences,
            sql: "INSERT INTO occurrences (id) SELECT id FROM templates RETURNING *",
            rrule: "RRULE:FREQ=DAILY",
        });

        const graph = buildObjectDependencyGraph(doc);
        const scheduleObject: GraphObject = { type: "schedule", id: ruleId };
        expect(ids(graph.dependenciesOf(scheduleObject))).toEqual(ids([
            { type: "table", id: occurrences },
            { type: "table", id: templates },
        ]));
        expect(graph.dependentsOf({ type: "table", id: occurrences })).toContainEqual(scheduleObject);
        expect(graph.dependentsOf({ type: "table", id: templates })).toContainEqual(scheduleObject);
    });

    it("records a Calendar's query-derived Table dependencies, one edge per relation", () => {
        const doc = new Y.Doc();
        const project = Project.fromDoc(doc);
        const tasks = table(doc, "Tasks", "tasks");
        const owners = table(doc, "Owners", "owners");
        const calendarId = createCalendar(project, {
            name: "Team Calendar",
            query: "SELECT tasks.id FROM tasks JOIN owners ON owners.id = tasks.id",
        });

        const graph = buildObjectDependencyGraph(doc);
        const calendarObject: GraphObject = { type: "calendar", id: calendarId };
        expect(ids(graph.dependenciesOf(calendarObject))).toEqual(ids([
            { type: "table", id: tasks },
            { type: "table", id: owners },
        ]));
        expect(graph.dependentsOf({ type: "table", id: tasks })).toContainEqual(calendarObject);
        expect(graph.dependentsOf({ type: "table", id: owners })).toContainEqual(calendarObject);
    });

    it("a Table's dependents span every Grid, Schedule and Calendar that references it", () => {
        const doc = new Y.Doc();
        const project = Project.fromDoc(doc);
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, undefined, { name: "Board", query: "SELECT * FROM tasks" });
        const ruleId = createScheduleRule(project, {
            targetTableId: tasks,
            sql: "INSERT INTO tasks (id) SELECT 1 RETURNING *",
            rrule: "RRULE:FREQ=DAILY",
        });
        const calendarId = createCalendar(project, { name: "Team Calendar", query: "SELECT id FROM tasks" });

        const graph = buildObjectDependencyGraph(doc);
        expect(ids(graph.dependentsOf({ type: "table", id: tasks }))).toEqual(ids([
            { type: "grid", id: gridId },
            { type: "schedule", id: ruleId },
            { type: "calendar", id: calendarId },
        ]));
    });

    it("does not treat a column or alias that shadows a Table's SQL name as a dependency", () => {
        const doc = new Y.Doc();
        const project = Project.fromDoc(doc);
        const tasks = table(doc, "Tasks", "tasks");
        const statusTable = table(doc, "Status", "status");
        const calendarId = createCalendar(project, {
            name: "Team Calendar",
            query: "SELECT status FROM tasks",
        });

        const graph = buildObjectDependencyGraph(doc);
        const calendarObject: GraphObject = { type: "calendar", id: calendarId };
        expect(ids(graph.dependenciesOf(calendarObject))).toEqual(ids([{ type: "table", id: tasks }]));
        expect(graph.dependentsOf({ type: "table", id: statusTable })).toEqual([]);
    });
});

describe("traverseObjectGraph", () => {
    it("follows only forward edges for 'dependencies'", () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, undefined, { name: "Board", query: "SELECT * FROM tasks" });
        const graph = buildObjectDependencyGraph(doc);

        const result = traverseObjectGraph(graph, [{ type: "grid", id: gridId }], "dependencies");
        expect(ids(result)).toEqual(ids([{ type: "grid", id: gridId }, { type: "table", id: tasks }]));
    });

    it("follows only reverse edges for 'dependents'", () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, undefined, { name: "Board", query: "SELECT * FROM tasks" });
        const graph = buildObjectDependencyGraph(doc);

        const result = traverseObjectGraph(graph, [{ type: "table", id: tasks }], "dependents");
        expect(ids(result)).toEqual(ids([{ type: "table", id: tasks }, { type: "grid", id: gridId }]));
    });

    it("recurses through both directions for 'connected', deduplicating a shared Table", () => {
        const doc = new Y.Doc();
        const project = Project.fromDoc(doc);
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, undefined, { name: "Board", query: "SELECT * FROM tasks" });
        const calendarId = createCalendar(project, { name: "Team Calendar", query: "SELECT id FROM tasks" });
        const graph = buildObjectDependencyGraph(doc);

        const result = traverseObjectGraph(graph, [{ type: "grid", id: gridId }], "connected");
        expect(ids(result)).toEqual(ids([
            { type: "grid", id: gridId },
            { type: "table", id: tasks },
            { type: "calendar", id: calendarId },
        ]));
    });

    it("unions multiple roots and selects each shared dependency only once", () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const first = createGrid(doc, undefined, { name: "First", query: "SELECT * FROM tasks" });
        const second = createGrid(doc, undefined, { name: "Second", query: "SELECT * FROM tasks" });
        const graph = buildObjectDependencyGraph(doc);

        const result = traverseObjectGraph(
            graph,
            [{ type: "grid", id: first }, { type: "grid", id: second }],
            "dependencies",
        );
        expect(ids(result)).toEqual(ids([
            { type: "grid", id: first },
            { type: "grid", id: second },
            { type: "table", id: tasks },
        ]));
        expect(result.filter(o => o.type === "table")).toHaveLength(1);
    });

    it("terminates on a circular reference", () => {
        const doc = new Y.Doc();
        const project = Project.fromDoc(doc);
        const tasks = table(doc, "Tasks", "tasks");
        createGrid(doc, undefined, { name: "Board", query: "SELECT * FROM tasks" });
        createScheduleRule(project, {
            targetTableId: tasks,
            sql: "INSERT INTO tasks (id) SELECT id FROM tasks RETURNING *",
            rrule: "RRULE:FREQ=DAILY",
        });

        const graph = buildObjectDependencyGraph(doc);
        const result = traverseObjectGraph(graph, [{ type: "table", id: tasks }], "connected");
        expect(result.filter(o => o.type === "table")).toHaveLength(1);
    });
});
