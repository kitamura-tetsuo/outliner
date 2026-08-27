import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCalendar } from "../../../services/calendar/calendarService";
import { createScheduleRule } from "../../../services/schedule/scheduleRuleService";
import { createGrid } from "../../../services/yjstable/gridDocs";
import { createTable } from "../../../services/yjstable/tableDocs";
import {
    filterObjects,
    generateBulkPreview,
    getObjects,
    type NamedObject,
    selectRelatedObjects,
    validateRename,
} from "./ObjectManagerController";

function table(doc: Y.Doc, name: string, sqlName: string): string {
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`);
    });
}

describe("ObjectManagerController", () => {
    describe("filterObjects", () => {
        const mockObjects: NamedObject[] = [
            { id: "1", type: "Table", name: "User Table", placements: [] },
            { id: "2", type: "Table", name: "Admin Table", placements: [] },
            { id: "3", type: "Grid", name: "User Grid", placements: [] },
            { id: "4", type: "Schedule", name: "Nightly Sync", placements: [] },
            { id: "5", type: "Calendar", name: "User Calendar", placements: [] },
        ];

        it("should filter by selected types", () => {
            const selectedTypes = new Set(["Table"]);
            const result = filterObjects(mockObjects, selectedTypes, "");
            expect(result).toHaveLength(2);
            expect(result.map(o => o.id)).toEqual(["1", "2"]);
        });

        it("should filter by search query (case-insensitive)", () => {
            const selectedTypes = new Set(["Table", "Grid", "Schedule", "Calendar"]);
            const result = filterObjects(mockObjects, selectedTypes, "user");
            expect(result).toHaveLength(3);
            expect(result.map(o => o.id)).toEqual(["1", "3", "5"]);
        });

        it("should filter by both type and search query", () => {
            const selectedTypes = new Set(["Table"]);
            const result = filterObjects(mockObjects, selectedTypes, "user");
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });

        it("should include Calendar objects when selected", () => {
            const selectedTypes = new Set(["Calendar"]);
            const result = filterObjects(mockObjects, selectedTypes, "");
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe("Calendar");
        });

        it("should exclude Calendar objects when not selected", () => {
            const selectedTypes = new Set(["Table", "Grid", "Schedule"]);
            const result = filterObjects(mockObjects, selectedTypes, "");
            expect(result.some(o => o.type === "Calendar")).toBe(false);
        });
    });

    describe("generateBulkPreview", () => {
        const mockObjects: NamedObject[] = [
            { id: "1", type: "Table", name: "Template Users", placements: [] },
            { id: "2", type: "Table", name: "Template Orders", placements: [] },
            { id: "3", type: "Grid", name: "Template Users Grid", placements: [] },
            { id: "4", type: "Table", name: "Other Table", placements: [] },
            { id: "5", type: "Calendar", name: "Template Calendar", placements: [] },
        ];

        it("should generate a preview with new names using replaceAll", () => {
            const selectedObjectIds = new Set(["1", "2", "3"]);
            const result = generateBulkPreview(mockObjects, selectedObjectIds, "Template ", "Project A ");

            expect(result).toHaveLength(3);
            expect(result.find(r => r.id === "1")?.newName).toBe("Project A Users");
            expect(result.find(r => r.id === "2")?.newName).toBe("Project A Orders");
            expect(result.find(r => r.id === "3")?.newName).toBe("Project A Users Grid");
        });

        it("should only include objects whose names will actually change", () => {
            const selectedObjectIds = new Set(["1", "2", "3", "4"]);
            // Object 4 does not contain "Template", so its name won't change
            const result = generateBulkPreview(mockObjects, selectedObjectIds, "Template ", "");

            expect(result).toHaveLength(3);
            expect(result.map(r => r.id)).not.toContain("4");
        });

        it("should replace all occurrences of the find string", () => {
            const obj: NamedObject[] = [{ id: "1", type: "Table", name: "copy test copy", placements: [] }];
            const selectedObjectIds = new Set(["1"]);
            const result = generateBulkPreview(obj, selectedObjectIds, "copy", "original");

            expect(result[0].newName).toBe("original test original");
        });

        it("should allow replacing with an empty string", () => {
            const selectedObjectIds = new Set(["5"]);
            const result = generateBulkPreview(mockObjects, selectedObjectIds, "Template ", "");
            expect(result[0].newName).toBe("Calendar");
        });
    });

    describe("validateRename", () => {
        it("rejects an empty name", () => {
            expect(validateRename(undefined, "Grid", "g1", "")).toBe("Name cannot be empty.");
        });

        it("rejects a whitespace-only name", () => {
            expect(validateRename(undefined, "Grid", "g1", "   ")).toBe("Name cannot be empty.");
        });

        it("accepts a non-empty name, including one that duplicates another object's name", () => {
            expect(validateRename(undefined, "Grid", "g1", "Duplicate Name")).toBeNull();
        });
    });

    describe("selectRelatedObjects", () => {
        it("returns nothing when nothing is selected", () => {
            const doc = new Y.Doc();
            table(doc, "Tasks", "tasks");
            const project = Project.fromDoc(doc);
            expect(selectRelatedObjects(project, getObjects(project), new Set(), "dependencies")).toEqual([]);
        });

        it("Dependencies from one root returns the Table it references", () => {
            const doc = new Y.Doc();
            const project = Project.fromDoc(doc);
            const tasksId = table(doc, "Tasks", "tasks");
            const gridId = createGrid(doc, tasksId, { name: "Board" });
            const objects = getObjects(project);

            const related = new Set(selectRelatedObjects(project, objects, new Set([gridId]), "dependencies"));
            expect(related).toEqual(new Set([gridId, tasksId]));
        });

        it("Dependents from one root returns every Grid/Schedule/Calendar referencing it", () => {
            const doc = new Y.Doc();
            const project = Project.fromDoc(doc);
            const tasksId = table(doc, "Tasks", "tasks");
            const gridId = createGrid(doc, tasksId, { name: "Board" });
            const ruleId = createScheduleRule(project, {
                targetTableId: tasksId,
                sql: "INSERT INTO tasks (id) SELECT 1 RETURNING *",
                rrule: "RRULE:FREQ=DAILY",
            });
            const calendarId = createCalendar(project, { name: "Team Calendar", query: "SELECT id FROM tasks" });
            const objects = getObjects(project);

            const related = new Set(selectRelatedObjects(project, objects, new Set([tasksId]), "dependents"));
            expect(related).toEqual(new Set([tasksId, gridId, ruleId, calendarId]));
        });

        it("All connected recurses across the whole graph", () => {
            const doc = new Y.Doc();
            const project = Project.fromDoc(doc);
            const tasksId = table(doc, "Tasks", "tasks");
            const gridId = createGrid(doc, tasksId, { name: "Board" });
            const calendarId = createCalendar(project, { name: "Team Calendar", query: "SELECT id FROM tasks" });
            const objects = getObjects(project);

            const related = new Set(selectRelatedObjects(project, objects, new Set([gridId]), "connected"));
            expect(related).toEqual(new Set([gridId, tasksId, calendarId]));
        });

        it("unions multiple selected roots and selects a shared dependency once", () => {
            const doc = new Y.Doc();
            const project = Project.fromDoc(doc);
            const tasksId = table(doc, "Tasks", "tasks");
            const first = createGrid(doc, tasksId, { name: "First" });
            const second = createGrid(doc, tasksId, { name: "Second" });
            const objects = getObjects(project);

            const related = selectRelatedObjects(project, objects, new Set([first, second]), "dependencies");
            expect(related.filter(id => id === tasksId)).toHaveLength(1);
        });

        it("is independent of the current search/type filter — the caller passes the full object list", () => {
            const doc = new Y.Doc();
            const project = Project.fromDoc(doc);
            const tasksId = table(doc, "Tasks", "tasks");
            const gridId = createGrid(doc, tasksId, { name: "Board" });
            const fullObjects = getObjects(project);
            // Simulates the Table being filtered out of view — it must still be
            // discoverable because `selectRelatedObjects` reads the Yjs graph
            // directly, not the filtered display list.
            const filteredOutOfView = fullObjects.filter(o => o.id !== tasksId);

            const related = selectRelatedObjects(project, fullObjects, new Set([gridId]), "dependencies");
            expect(related).toContain(tasksId);
            expect(filteredOutOfView.some(o => o.id === tasksId)).toBe(false);
        });

        it("returns an additive result: the caller is expected to union it into the existing selection", () => {
            const doc = new Y.Doc();
            const project = Project.fromDoc(doc);
            const tasksId = table(doc, "Tasks", "tasks");
            const owners = table(doc, "Owners", "owners");
            const gridId = createGrid(doc, tasksId, { name: "Board" });
            const objects = getObjects(project);

            const existingSelection = new Set([gridId, owners]);
            const related = selectRelatedObjects(project, objects, existingSelection, "dependencies");
            const union = new Set([...existingSelection, ...related]);
            expect(union).toEqual(new Set([gridId, owners, tasksId]));
        });

        it("terminates on a circular reference", () => {
            const doc = new Y.Doc();
            const project = Project.fromDoc(doc);
            const tasksId = table(doc, "Tasks", "tasks");
            createGrid(doc, tasksId, { name: "Board" });
            createScheduleRule(project, {
                targetTableId: tasksId,
                sql: "INSERT INTO tasks (id) SELECT id FROM tasks RETURNING *",
                rrule: "RRULE:FREQ=DAILY",
            });
            const objects = getObjects(project);

            const related = selectRelatedObjects(project, objects, new Set([tasksId]), "connected");
            expect(related.filter(id => id === tasksId)).toHaveLength(1);
        });
    });
});
