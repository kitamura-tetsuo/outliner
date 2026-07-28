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
                roles: { groupAxes: [] },
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
                roles: { groupAxes: [] },
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
                roles: { roleStart: "start_at", groupAxes: [] },
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
                roles: { groupAxes: [] },
                readOnly: true,
                readOnlyReason: "Read-only calendar: missing source_kind/source_id",
            },
        });

        expect(getByTestId("calendar-read-only-banner").textContent).toMatch(/source_kind/);
    });

    it("toggles a group axis on and off", async () => {
        const { getByTestId } = render(CalendarRoleEditor, {
            props: {
                project,
                calendarId,
                resultColumns: ["id", "tags"],
                roles: { groupAxes: [] },
                readOnly: false,
            },
        });

        const checkbox = getByTestId("calendar-group-axis-tags") as HTMLInputElement;
        await fireEvent.click(checkbox);
        expect(getCalendar(project, calendarId)?.groupAxes).toEqual(["tags"]);

        await fireEvent.click(checkbox);
        expect(getCalendar(project, calendarId)?.groupAxes).toEqual([]);
    });
});
