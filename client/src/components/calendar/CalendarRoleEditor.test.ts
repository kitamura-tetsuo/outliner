import { Project } from "$shared/app-schema";
import { fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCalendar, destroyCalendarUndoManager, getCalendar } from "../../services/calendar/calendarService";
import { globalUndoRouter } from "../../services/undo/undoRouter";
import CalendarRoleEditor from "./CalendarRoleEditor.svelte";

describe("CalendarRoleEditor", () => {
    let project: Project;
    let calendarId: string;

    beforeEach(() => {
        project = Project.createInstance("Test Project");
        calendarId = createCalendar(project, { name: "Cal" });
    });

    afterEach(() => {
        destroyCalendarUndoManager(project.ydoc);
        globalUndoRouter.clear();
    });

    it("lists the current result columns, in result order", () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "title", "start_at"],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        const titleSelect = getByTestId("calendar-role-roleTitle") as HTMLSelectElement;
        const optionValues = Array.from(titleSelect.options).map((o) => o.value);
        expect(optionValues).toEqual(["", "id", "title", "start_at"]);
    });

    it("writes the selected column into the calendar's role assignment", async () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "title", "start_at"],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        const titleSelect = getByTestId("calendar-role-roleTitle") as HTMLSelectElement;
        await fireEvent.change(titleSelect, { target: { value: "title" } });

        expect(getCalendar(project, calendarId)?.roleTitle).toBe("title");
    });

    it("keeps a previously assigned column visible even when the query no longer returns it", () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "title"],
                roles: { roleStart: "start_at", groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        const startSelect = getByTestId("calendar-role-roleStart") as HTMLSelectElement;
        const optionValues = Array.from(startSelect.options).map((o) => o.value);
        expect(optionValues).toContain("start_at");
        expect(startSelect.value).toBe("start_at");
    });

    it("shows the read-only banner when the query is missing source_kind/source_id", () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "title"],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: true,
                readOnlyReason: "Read-only calendar: missing source_kind/source_id",
            },
        });

        expect(getByTestId("calendar-read-only-banner").textContent).toMatch(/source_kind/);
    });

    it("writes the selected column into the due role assignment", async () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "due"],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        const dueSelect = getByTestId("calendar-role-roleDue") as HTMLSelectElement;
        await fireEvent.change(dueSelect, { target: { value: "due" } });

        expect(getCalendar(project, calendarId)?.roleDue).toBe("due");
    });

    it("warns when the query references neither view.range_start nor view.range_end", () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                query: "SELECT id, text AS title, due FROM outline_items",
                resultColumns: ["id", "title", "due"],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        expect(getByTestId("calendar-range-warning").textContent).toMatch(/view\.range_start/);
    });

    it("does not warn when the query references view.range_start", () => {
        const { queryByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                query:
                    "SELECT id FROM outline_items WHERE start_at >= current_setting('view.range_start')::timestamptz",
                resultColumns: ["id"],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        expect(queryByTestId("calendar-range-warning")).toBeNull();
    });

    it("does not warn on an empty query", () => {
        const { queryByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                query: "",
                resultColumns: [],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        expect(queryByTestId("calendar-range-warning")).toBeNull();
    });

    it("toggles a group axis on and off", async () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "tags"],
                roles: { groupAxes: [], laneOrder: [] },
                readOnly: false,
            },
        });

        const checkbox = getByTestId("calendar-group-axis-tags") as HTMLInputElement;
        await fireEvent.click(checkbox);
        expect(getCalendar(project, calendarId)?.groupAxes).toEqual(["tags"]);

        await fireEvent.click(checkbox);
        expect(getCalendar(project, calendarId)?.groupAxes).toEqual([]);
    });

    it("lists the configured lane order plus any not-yet-ordered known value", () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "tags"],
                roles: { groupAxes: ["tags"], laneOrder: ["urgent"] },
                readOnly: false,
                knownLaneValues: ["urgent", "work"],
            },
        });

        const list = getByTestId("calendar-lane-order");
        expect(list.textContent).toContain("urgent");
        expect(list.textContent).toContain("work");
        // Configured order first, then the not-yet-ordered known value.
        expect(list.textContent!.indexOf("urgent")).toBeLessThan(list.textContent!.indexOf("work"));
    });

    it("moves a lane up/down and persists the reordered list", async () => {
        const props = {
            project,
            calendarId,
            resultColumns: ["id", "tags"],
            roles: { groupAxes: ["tags"], laneOrder: ["urgent", "work"] },
            readOnly: false,
            knownLaneValues: ["urgent", "work"],
        };
        const { getByTestId, rerender } = render(CalendarRoleEditor, { props });

        await fireEvent.click(getByTestId("calendar-lane-order-down-urgent"));
        expect(getCalendar(project, calendarId)?.laneOrder).toEqual(["work", "urgent"]);

        // Re-render with the persisted order, as CalendarView.svelte's reactive
        // mirror would after the Yjs write above.
        await rerender({ ...props, roles: { groupAxes: ["tags"], laneOrder: ["work", "urgent"] } });
        expect((getByTestId("calendar-lane-order-up-work") as HTMLButtonElement).disabled).toBe(true);
    });

    it("toggles the show-empty-lanes setting", async () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "tags"],
                roles: { groupAxes: ["tags"], laneOrder: [] },
                readOnly: false,
            },
        });

        const checkbox = getByTestId("calendar-show-empty-lanes") as HTMLInputElement;
        expect(checkbox.checked).toBe(false);

        await fireEvent.click(checkbox);
        expect(getCalendar(project, calendarId)?.showEmptyLanes).toBe(true);
    });
});
