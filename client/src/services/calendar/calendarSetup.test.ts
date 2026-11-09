import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getGridRegistry } from "../yjstable/gridDocs";
import { getTableHandles, listTables } from "../yjstable/tableDocs";
import { createTableOnlyFromPreset, HABITS_PRESET, TASKS_PRESET } from "../yjstable/tablePresets";
import { getItemCalendarId } from "./calendarBinding";
import { createCalendar, getCalendar } from "./calendarService";
import {
    bindExistingCalendar,
    createCalendarOverExistingTable,
    createCalendarWithNewTable,
    createIndependentCalendar,
} from "./calendarSetup";

const allowed = { projectAccess: true, surfaceWritable: true };

function setup() {
    const project = Project.createInstance("Calendar setup");
    const value = new Y.Map<unknown>();
    project.ydoc.getMap("test-items").set("placement", value);
    value.set("componentType", "calendar");
    const item = {
        ydoc: project.ydoc,
        tree: { getNodeValueFromKey: () => value },
        key: "placement",
    };
    return { project, item, value };
}

describe("Calendar Table-backed setup", () => {
    it("preserves independent and shared existing Calendar modes", () => {
        const { project, item, value } = setup();
        const independent = createIndependentCalendar(item, "Independent", allowed);
        expect(getCalendar(project, independent)).toMatchObject({ name: "Independent", query: "" });
        expect(listTables(project.ydoc)).toHaveLength(0);

        value.delete("calendarId");
        const existing = createCalendar(project, { name: "Shared", query: "SELECT id FROM outline_items" });
        expect(bindExistingCalendar(item, existing, allowed)).toBe(existing);
        expect(getItemCalendarId(item)).toBe(existing);
        expect(project.calendars.size).toBe(2);
    });

    it("creates a preset Table and Calendar without a Grid or source ownership", () => {
        const { project, item } = setup();
        const result = createCalendarWithNewTable(item, {
            preset: TASKS_PRESET,
            name: "Release Tasks",
            sqlName: "release_tasks",
        }, allowed);

        expect(listTables(project.ydoc)).toHaveLength(1);
        expect(getTableHandles(project.ydoc, result.tableId)?.schemaText.toString()).toBe(
            TASKS_PRESET.schemaSql("release_tasks"),
        );
        expect(getGridRegistry(project.ydoc).size).toBe(0);
        expect(getCalendar(project, result.calendarId)).toMatchObject({
            name: "Release Tasks",
            query: TASKS_PRESET.query("release_tasks"),
            roleTitle: "title",
            roleDue: "due_date",
        });
        expect(project.calendars.get(result.calendarId)?.has("sourceTableId")).toBe(false);
        expect(project.calendars.get(result.calendarId)?.has("insertTargetTableId")).toBe(false);
    });

    it("does not infer a scheduled start for the Habits preset", () => {
        const { project, item } = setup();
        const { calendarId } = createCalendarWithNewTable(item, {
            preset: HABITS_PRESET,
            name: "Habits",
            sqlName: "my_habits",
        }, allowed);
        expect(getCalendar(project, calendarId)).toMatchObject({ roleTitle: "name" });
        expect(getCalendar(project, calendarId)?.roleStart).toBeUndefined();
    });

    it("creates an independent Calendar over the selected live Table", () => {
        const { project, item } = setup();
        const tableId = createTableOnlyFromPreset(project.ydoc, TASKS_PRESET, "Tasks", "tasks_live");
        const calendarId = createCalendarOverExistingTable(
            item,
            { tableId, sqlName: "tasks_live" },
            "Planning",
            allowed,
        );
        expect(getCalendar(project, calendarId)).toMatchObject({ name: "Planning", query: "SELECT * FROM tasks_live" });
        expect(getCalendar(project, calendarId)?.roleTitle).toBeUndefined();
        expect(listTables(project.ydoc)).toHaveLength(1);
        expect(getGridRegistry(project.ydoc).size).toBe(0);
    });

    it("refuses stale sources, rebound placements, and denied writes without effects", () => {
        const cases = [
            () => {
                const state = setup();
                const tableId = createTableOnlyFromPreset(state.project.ydoc, TASKS_PRESET, "Tasks", "renamed");
                return {
                    state,
                    action: () =>
                        createCalendarOverExistingTable(state.item, { tableId, sqlName: "old_name" }, "Cal", allowed),
                };
            },
            () => {
                const state = setup();
                state.value.set("calendarId", "peer-calendar");
                return { state, action: () => createIndependentCalendar(state.item, "Cal", allowed) };
            },
            () => {
                const state = setup();
                return {
                    state,
                    action: () =>
                        createCalendarWithNewTable(state.item, {
                            preset: TASKS_PRESET,
                            name: "Tasks",
                            sqlName: "tasks",
                        }, { projectAccess: true, surfaceWritable: false }),
                };
            },
        ];
        for (const makeCase of cases) {
            const { state, action } = makeCase();
            const beforeTables = listTables(state.project.ydoc).length;
            const beforeCalendars = state.project.calendars.size;
            expect(action).toThrow();
            expect(listTables(state.project.ydoc)).toHaveLength(beforeTables);
            expect(state.project.calendars.size).toBe(beforeCalendars);
        }
    });
});
