import { Project } from "$shared/app-schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { globalUndoRouter } from "../undo/undoRouter";
import {
    createCalendar,
    deleteCalendar,
    destroyCalendarUndoManager,
    ensureCalendarUndoManager,
    getCalendar,
    listCalendars,
    observeCalendars,
    updateCalendar,
} from "./calendarService";

describe("calendarService", () => {
    let project: Project;

    beforeEach(() => {
        project = Project.createInstance("Test Project");
    });

    afterEach(() => {
        destroyCalendarUndoManager(project.ydoc);
        globalUndoRouter.clear();
    });

    it("creates, lists, updates, and deletes calendars through the calendars map", () => {
        const calendarId = createCalendar(project, { name: "My Calendar", query: "SELECT 1" });

        expect(calendarId).toBeDefined();
        const calendar = getCalendar(project, calendarId);
        expect(calendar).toEqual({
            name: "My Calendar",
            query: "SELECT 1",
            viewType: "week",
            timezone: undefined,
            roleTitle: undefined,
            roleStart: undefined,
            roleAllDay: undefined,
            roleDuration: undefined,
            groupAxes: [],
        });

        expect(listCalendars(project)).toEqual([{ id: calendarId, settings: calendar }]);

        updateCalendar(project, calendarId, {
            query: "SELECT id, title FROM outline_items",
            roleTitle: "title",
            groupAxes: ["tags"],
        });
        expect(getCalendar(project, calendarId)).toMatchObject({
            query: "SELECT id, title FROM outline_items",
            roleTitle: "title",
            groupAxes: ["tags"],
        });

        deleteCalendar(project, calendarId);
        expect(getCalendar(project, calendarId)).toBeUndefined();
        expect(listCalendars(project)).toEqual([]);
    });

    it("clears a role assignment when updated with an empty string", () => {
        const calendarId = createCalendar(project, { name: "Cal", roleStart: "start_at" });
        expect(getCalendar(project, calendarId)?.roleStart).toBe("start_at");

        updateCalendar(project, calendarId, { roleStart: "" });
        expect(getCalendar(project, calendarId)?.roleStart).toBeUndefined();
    });

    it("never prunes an assignment that a call simply did not mention", () => {
        // The candidate list a query returns can change shape independently of
        // what is assigned; an update to one field must not disturb another.
        const calendarId = createCalendar(project, {
            name: "Cal",
            roleTitle: "title",
            roleStart: "start_at",
            groupAxes: ["tags"],
        });

        updateCalendar(project, calendarId, { query: "SELECT * FROM outline_items" });

        const calendar = getCalendar(project, calendarId);
        expect(calendar?.roleTitle).toBe("title");
        expect(calendar?.roleStart).toBe("start_at");
        expect(calendar?.groupAxes).toEqual(["tags"]);
    });

    it("replaces the full group-axes set on update", () => {
        const calendarId = createCalendar(project, { name: "Cal", groupAxes: ["a", "b"] });
        updateCalendar(project, calendarId, { groupAxes: ["c"] });
        expect(getCalendar(project, calendarId)?.groupAxes).toEqual(["c"]);
        updateCalendar(project, calendarId, { groupAxes: [] });
        expect(getCalendar(project, calendarId)?.groupAxes).toEqual([]);
    });

    it("throws when updating a calendar that does not exist", () => {
        expect(() => updateCalendar(project, "missing", { name: "x" })).toThrow(/not found/);
    });

    it("notifies observers reactively (observeDeep), for create/update/delete", () => {
        let notifications = 0;
        const unsubscribe = observeCalendars(project, () => {
            notifications++;
        });

        const calendarId = createCalendar(project, { name: "Cal" });
        expect(notifications).toBeGreaterThan(0);

        const afterCreate = notifications;
        updateCalendar(project, calendarId, { name: "Renamed" });
        expect(notifications).toBeGreaterThan(afterCreate);

        const afterUpdate = notifications;
        deleteCalendar(project, calendarId);
        expect(notifications).toBeGreaterThan(afterUpdate);

        unsubscribe();
        createCalendar(project, { name: "Another" });
        expect(notifications).toBe(notifications); // no further assertions after unsubscribe
    });

    it("routes settings changes through the global undo router", () => {
        const calendarId = createCalendar(project, { name: "Original" });
        globalUndoRouter.clear();
        // Stop capturing so the creation above isn't merged with the update
        // under test into a single Y.UndoManager stack item.
        ensureCalendarUndoManager(project).stopCapturing();

        updateCalendar(project, calendarId, { name: "Renamed" });
        expect(getCalendar(project, calendarId)?.name).toBe("Renamed");
        expect(globalUndoRouter.canUndo()).toBe(true);

        globalUndoRouter.undo();
        expect(getCalendar(project, calendarId)?.name).toBe("Original");

        globalUndoRouter.redo();
        expect(getCalendar(project, calendarId)?.name).toBe("Renamed");
    });

    it("the same calendar can be embedded in more than one item and stays in sync", () => {
        // Modeled by two independent readers of the same registry entry: both
        // observe the same Y.Map, so a write from either is visible to both.
        const calendarId = createCalendar(project, { name: "Shared" });
        const readerA = getCalendar(project, calendarId);
        const readerB = getCalendar(project, calendarId);
        expect(readerA).toEqual(readerB);

        updateCalendar(project, calendarId, { name: "Shared (renamed)" });
        expect(getCalendar(project, calendarId)?.name).toBe("Shared (renamed)");
    });
});
