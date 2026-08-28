import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { type CalendarSettings, createCalendar, getCalendar, listCalendars } from "../calendar/calendarService";
import { createGrid } from "./gridDocs";
import { duplicateObjects, previewObjectDuplication } from "./objectDuplication";
import { createTable, listTables } from "./tableDocs";

function table(doc: Y.Doc, name: string, sqlName: string): string {
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`);
    });
}

function calendar(
    doc: Y.Doc,
    name: string,
    query: string,
    extra: Partial<CalendarSettings> = {},
): string {
    return createCalendar(Project.fromDoc(doc), { name, query, ...extra });
}

describe("dependency-aware Calendar duplication", () => {
    it("duplicates a Calendar with no Table reference on its own", async () => {
        const doc = new Y.Doc();
        const calendarId = calendar(doc, "Team Calendar", "");
        const preview = previewObjectDuplication(doc, { type: "calendar", id: calendarId }, "item-only");
        expect(preview.objects).toEqual([{ type: "calendar", id: calendarId }]);
        expect(preview.omittedReferenceCount).toBe(0);

        const result = await duplicateObjects(doc, doc, { type: "calendar", id: calendarId }, "item-only");
        expect(listCalendars(Project.fromDoc(doc)).map(entry => entry.settings.name)).toContain("Team Calendar copy");
        expect(getCalendar(Project.fromDoc(doc), result.primaryId)?.query).toBe("");
    });

    it("discovers every Table a Calendar's query reads and copies them together", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const owners = table(doc, "Owners", "owners");
        const calendarId = calendar(
            doc,
            "Team Calendar",
            "SELECT tasks.id, tasks.title FROM tasks JOIN owners ON owners.id = tasks.id",
        );

        const preview = previewObjectDuplication(doc, { type: "calendar", id: calendarId }, "referenced");
        expect(preview.objects).toEqual([
            { type: "calendar", id: calendarId },
            { type: "table", id: tasks },
            { type: "table", id: owners },
        ]);

        const result = await duplicateObjects(doc, doc, { type: "calendar", id: calendarId }, "referenced");
        const copiedTasksSqlName = listTables(doc).find(t => t.tableId === result.idMap.get(`table:${tasks}`))!
            .sqlName;
        const copiedOwnersSqlName = listTables(doc).find(t => t.tableId === result.idMap.get(`table:${owners}`))!
            .sqlName;
        const copiedQuery = getCalendar(Project.fromDoc(doc), result.primaryId)?.query;
        expect(copiedQuery).toBe(
            `SELECT ${copiedTasksSqlName}.id, ${copiedTasksSqlName}.title FROM ${copiedTasksSqlName} `
                + `JOIN ${copiedOwnersSqlName} ON ${copiedOwnersSqlName}.id = ${copiedTasksSqlName}.id`,
        );
    });

    it("traverses a connected Grid -> Table <- Calendar graph from either end", async () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tasks, { name: "Board" });
        const calendarId = calendar(doc, "Team Calendar", "SELECT id, title FROM tasks");

        const fromGrid = previewObjectDuplication(doc, { type: "grid", id: gridId }, "connected");
        expect(fromGrid.objects.filter(o => o.type === "table")).toHaveLength(1);
        expect(fromGrid.objects.some(o => o.type === "calendar" && o.id === calendarId)).toBe(true);

        const fromCalendar = previewObjectDuplication(doc, { type: "calendar", id: calendarId }, "connected");
        expect(fromCalendar.objects.filter(o => o.type === "table")).toHaveLength(1);
        expect(fromCalendar.objects.some(o => o.type === "grid" && o.id === gridId)).toBe(true);

        const result = await duplicateObjects(doc, doc, { type: "grid", id: gridId }, "connected");
        expect(result.createdObjects.some(o => o.type === "calendar")).toBe(true);
    });

    it("keeps a same-project omitted Table reference and clears it cross-project", async () => {
        const source = new Y.Doc();
        table(source, "Tasks", "tasks");
        const calendarId = calendar(source, "Team Calendar", "SELECT id FROM tasks");

        const local = await duplicateObjects(source, source, { type: "calendar", id: calendarId }, "item-only");
        expect(getCalendar(Project.fromDoc(source), local.primaryId)?.query).toBe("SELECT id FROM tasks");

        const destination = new Y.Doc();
        const remote = await duplicateObjects(source, destination, { type: "calendar", id: calendarId }, "item-only");
        expect(getCalendar(Project.fromDoc(destination), remote.primaryId)?.query).toBe("");
        expect(remote.removedReferenceCount).toBe(1);
    });

    it("preserves every persistent Calendar setting across a duplicate", async () => {
        const doc = new Y.Doc();
        table(doc, "Tasks", "tasks");
        const calendarId = calendar(doc, "Team Calendar", "SELECT id, title FROM tasks", {
            viewType: "gantt",
            timezone: "Asia/Tokyo",
            roleTitle: "title",
            roleStart: "id",
            groupAxes: ["title"],
            laneOrder: ["a", "b"],
            weekStart: 1,
            workingHoursStartMinutes: 480,
            workingHoursEndMinutes: 1020,
            ganttScale: "week",
        });

        const result = await duplicateObjects(doc, doc, { type: "calendar", id: calendarId }, "referenced");
        const copied = getCalendar(Project.fromDoc(doc), result.primaryId);
        expect(copied?.viewType).toBe("gantt");
        expect(copied?.timezone).toBe("Asia/Tokyo");
        expect(copied?.roleTitle).toBe("title");
        expect(copied?.roleStart).toBe("id");
        expect(copied?.groupAxes).toEqual(["title"]);
        expect(copied?.laneOrder).toEqual(["a", "b"]);
        expect(copied?.weekStart).toBe(1);
        expect(copied?.workingHoursStartMinutes).toBe(480);
        expect(copied?.workingHoursEndMinutes).toBe(1020);
        expect(copied?.ganttScale).toBe("week");
    });

    it("assigns collision-safe copy names to duplicated Calendars", async () => {
        const doc = new Y.Doc();
        const first = calendar(doc, "Calendar", "");
        calendar(doc, "Calendar copy", "");

        const result = await duplicateObjects(doc, doc, { type: "calendar", id: first }, "item-only");
        expect(getCalendar(Project.fromDoc(doc), result.primaryId)?.name).toBe("Calendar copy 2");
    });

    it("never creates an outline placement for the duplicated Calendar", async () => {
        const doc = new Y.Doc();
        const calendarId = calendar(doc, "Team Calendar", "");
        const project = Project.fromDoc(doc);
        const before = [...project.items].length;

        await duplicateObjects(doc, doc, { type: "calendar", id: calendarId }, "item-only");
        expect([...project.items].length).toBe(before);
    });
});
