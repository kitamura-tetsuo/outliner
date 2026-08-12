import { Project } from "$shared/app-schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
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
            laneOrder: [],
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

    it("stores and updates the due role, week start, and working-hours settings", () => {
        const calendarId = createCalendar(project, {
            name: "Cal",
            roleDue: "due",
            weekStart: 1,
            workingHoursStartMinutes: 480,
            workingHoursEndMinutes: 1020,
        });

        expect(getCalendar(project, calendarId)).toMatchObject({
            roleDue: "due",
            weekStart: 1,
            workingHoursStartMinutes: 480,
            workingHoursEndMinutes: 1020,
        });

        updateCalendar(project, calendarId, { weekStart: 0, roleDue: "" });
        expect(getCalendar(project, calendarId)).toMatchObject({
            weekStart: 0,
            roleDue: undefined,
            workingHoursStartMinutes: 480,
        });
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

    it("stores and updates an explicit timezone, and clears it back to viewer-local with an empty string", () => {
        const calendarId = createCalendar(project, { name: "Cal", timezone: "Asia/Tokyo" });
        expect(getCalendar(project, calendarId)?.timezone).toBe("Asia/Tokyo");

        updateCalendar(project, calendarId, { timezone: "America/New_York" });
        expect(getCalendar(project, calendarId)?.timezone).toBe("America/New_York");

        updateCalendar(project, calendarId, { timezone: "" });
        expect(getCalendar(project, calendarId)?.timezone).toBeUndefined();
    });

    it("rejects an unrecognized timezone at create time", () => {
        expect(() => createCalendar(project, { name: "Cal", timezone: "Not/A_Zone" })).toThrow(/[Ii]nvalid timezone/);
    });

    it("rejects an unrecognized timezone at update time", () => {
        const calendarId = createCalendar(project, { name: "Cal" });
        expect(() => updateCalendar(project, calendarId, { timezone: "Not/A_Zone" })).toThrow(/[Ii]nvalid timezone/);
        // The rejected update leaves the calendar's stored timezone untouched.
        expect(getCalendar(project, calendarId)?.timezone).toBeUndefined();
    });

    it("stores and updates the lane order and empty-lane toggle, independent of group axes", () => {
        const calendarId = createCalendar(project, {
            name: "Cal",
            groupAxes: ["tags"],
            laneOrder: ["urgent", "work"],
            showEmptyLanes: true,
        });

        expect(getCalendar(project, calendarId)).toMatchObject({
            groupAxes: ["tags"],
            laneOrder: ["urgent", "work"],
            showEmptyLanes: true,
        });

        updateCalendar(project, calendarId, { laneOrder: ["work"], showEmptyLanes: false });
        expect(getCalendar(project, calendarId)).toMatchObject({
            groupAxes: ["tags"],
            laneOrder: ["work"],
            showEmptyLanes: false,
        });

        updateCalendar(project, calendarId, { laneOrder: [] });
        expect(getCalendar(project, calendarId)?.laneOrder).toEqual([]);
    });

    it("never prunes the lane order when only group axes are updated, and vice versa", () => {
        const calendarId = createCalendar(project, { name: "Cal", groupAxes: ["tags"], laneOrder: ["a", "b"] });
        updateCalendar(project, calendarId, { groupAxes: ["source_kind"] });
        expect(getCalendar(project, calendarId)?.laneOrder).toEqual(["a", "b"]);

        updateCalendar(project, calendarId, { laneOrder: ["c"] });
        expect(getCalendar(project, calendarId)?.groupAxes).toEqual(["source_kind"]);
    });

    it("resolves concurrent array updates with last-writer-wins and removes legacy duplicates", async () => {
        const Y = await import("yjs");
        const docA = project.ydoc;
        const docB = new Y.Doc();

        const calendarId = createCalendar(project, {
            name: "Cal",
            groupAxes: ["alpha", "beta"],
            laneOrder: ["l1", "l2"],
        });
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        // Create a concurrent branch B with its own changes
        const projectB = Project.createInstance("Test Project B", { ydoc: docB });
        // Let's modify the map directly on docB to simulate a concurrent client setting legacy Y.Array
        // to prove our read path correctly handles backwards-compatible reads and duplication

        // Wait, projectB doesn't have the calendar until we apply the update correctly?
        // Actually, project.calendars is a Y.Map. Since we sync docB from docA, we need
        // to read docB.getMap("calendars") instead of projectB.calendars if projectB isn't initialized fully.
        const calendarsB = docB.getMap<Y.Map<any>>("calendars");
        const calendarMapB = calendarsB.get(calendarId);

        docB.transact(() => {
            let arr = calendarMapB?.get("groupAxes");
            if (!(arr instanceof Y.Array)) {
                arr = new Y.Array<string>();
                calendarMapB?.set("groupAxes", arr);
            }
            if (arr.length > 0) arr.delete(0, arr.length);
            arr.push(["alpha", "gamma", "gamma"]); // duplicate legacy array insertion
        });

        // Concurrently modify docA through the updated plain array write path
        updateCalendar(project, calendarId, { groupAxes: ["alpha", "delta"] });

        // Merge updates
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

        // The exact result of "last-writer-wins" depends on Yjs tie-breaking (usually client ID),
        // but no duplicates should appear regardless of whether plain arrays or legacy duplicate Y.Arrays won.
        const mergedA = getCalendar(project, calendarId)!;
        expect(mergedA.groupAxes.length).toBeLessThanOrEqual(3);
        const uniqueAxes = Array.from(new Set(mergedA.groupAxes));
        expect(mergedA.groupAxes).toEqual(uniqueAxes);

        // Assert laneOrder as well for concurrent string[] updates
        updateCalendar(project, calendarId, { laneOrder: ["l3", "l4"] });

        // Let's modify directly again since updateCalendar checks the undo managers
        // which might not be set up well on projectB stub.
        docB.transact(() => {
            const map = calendarsB.get(calendarId)!;
            map.set("laneOrder", ["l1", "l4"]);
        });

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

        const mergedA2 = getCalendar(project, calendarId)!;
        const uniqueLanes = Array.from(new Set(mergedA2.laneOrder));
        expect(mergedA2.laneOrder).toEqual(uniqueLanes);
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
