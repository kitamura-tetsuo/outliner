// Real PGlite + the real table engine session (AGENTS.md §2), same pattern
// as calendarQueryRunner.test.ts — outline_items needs no `connect` override
// since it never goes through a table subdoc connector.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { createCalendar, destroyCalendarUndoManager, getCalendar } from "../../services/calendar/calendarService";
import { globalUndoRouter } from "../../services/undo/undoRouter";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import CalendarView from "./CalendarView.svelte";

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function seedProject(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const project = Project.fromDoc(projectDoc);
    const page = new Items(projectDoc, project.tree, "root").addNode("tester");
    page.text = "Tasks";
    return { projectDoc, project, page };
}

afterEach(async () => {
    await resetTableEngineForTests();
    globalUndoRouter.clear();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("CalendarView", { timeout: 60000 }, () => {
    it("renders a timed entry from the query result in the week time-grid", async () => {
        const projectId = "proj-calendar-view-week";
        const { projectDoc, project, page } = seedProject(projectId);
        const item = new Items(projectDoc, project.tree, page.key).addNode("tester");
        item.text = "Standup";
        item.start = `${todayIso()}T09:00:00.000Z`;
        item.allDay = false;
        item.duration = "PT30M";

        const calendarId = createCalendar(project, {
            name: "Cal",
            query: "SELECT id, text AS title, all_day, start_at, duration, "
                + "'item' AS source_kind, id AS source_id FROM outline_items",
            roleTitle: "title",
            roleStart: "start_at",
            roleAllDay: "all_day",
            roleDuration: "duration",
        });

        const { getByTestId } = render(CalendarView, { props: { project, projectId, calendarId } });

        await waitFor(() => {
            expect(getByTestId(`calendar-entry-item:${item.key}`)).toBeTruthy();
        }, { timeout: 15000 });
        expect(getByTestId("calendar-time-grid")).toBeTruthy();

        destroyCalendarUndoManager(projectDoc);
    });

    it("renders an all-day entry in the month view's day cell", async () => {
        const projectId = "proj-calendar-view-month";
        const { projectDoc, project, page } = seedProject(projectId);
        const item = new Items(projectDoc, project.tree, page.key).addNode("tester");
        item.text = "Conference";
        item.start = todayIso();
        item.allDay = true;

        const calendarId = createCalendar(project, {
            name: "Cal",
            viewType: "month",
            query: "SELECT id, text AS title, all_day, start_on, "
                + "'item' AS source_kind, id AS source_id FROM outline_items",
            roleTitle: "title",
            roleStart: "start_on",
            roleAllDay: "all_day",
        });

        const { getByTestId } = render(CalendarView, { props: { project, projectId, calendarId } });

        await waitFor(() => {
            expect(getByTestId(`calendar-entry-item:${item.key}`)).toBeTruthy();
        }, { timeout: 15000 });
        expect(getByTestId("calendar-month-grid")).toBeTruthy();

        destroyCalendarUndoManager(projectDoc);
    });

    it("switches viewType through the toolbar select and persists it to the calendar's settings", async () => {
        const projectId = "proj-calendar-view-switch";
        const { project } = seedProject(projectId);
        const calendarId = createCalendar(project, { name: "Cal", query: "SELECT 1" });

        const { getByTestId } = render(CalendarView, { props: { project, projectId, calendarId } });
        await waitFor(() => expect(getByTestId("calendar-view-type")).toBeTruthy(), { timeout: 15000 });

        await fireEvent.change(getByTestId("calendar-view-type"), { target: { value: "month" } });
        expect(getCalendar(project, calendarId)?.viewType).toBe("month");
        await waitFor(() => expect(getByTestId("calendar-month-grid")).toBeTruthy(), { timeout: 15000 });

        destroyCalendarUndoManager(project.ydoc);
    });

    it("Prev/Today/Next update the displayed range label", async () => {
        const projectId = "proj-calendar-view-nav";
        const { project } = seedProject(projectId);
        const calendarId = createCalendar(project, { name: "Cal", viewType: "day", query: "SELECT 1" });

        const { getByTestId } = render(CalendarView, { props: { project, projectId, calendarId } });
        await waitFor(() => expect(getByTestId("calendar-range-label")).toBeTruthy(), { timeout: 15000 });

        const before = getByTestId("calendar-range-label").textContent;
        await fireEvent.click(getByTestId("calendar-nav-next"));
        const afterNext = getByTestId("calendar-range-label").textContent;
        expect(afterNext).not.toBe(before);

        await fireEvent.click(getByTestId("calendar-nav-today"));
        const afterToday = getByTestId("calendar-range-label").textContent;
        expect(afterToday).toBe(before);

        destroyCalendarUndoManager(project.ydoc);
    });

    it("a query missing source_kind/source_id shows entries as non-writable", async () => {
        const projectId = "proj-calendar-view-readonly";
        const { projectDoc, project, page } = seedProject(projectId);
        const item = new Items(projectDoc, project.tree, page.key).addNode("tester");
        item.text = "Untracked";
        item.start = `${todayIso()}T09:00:00.000Z`;
        item.allDay = false;

        const calendarId = createCalendar(project, {
            name: "Cal",
            query: "SELECT id, text AS title, all_day, start_at FROM outline_items",
            roleTitle: "title",
            roleStart: "start_at",
            roleAllDay: "all_day",
        });

        const { getByTestId } = render(CalendarView, { props: { project, projectId, calendarId } });

        await waitFor(() => expect(getByTestId("calendar-read-only-banner")).toBeTruthy(), { timeout: 15000 });
        await waitFor(() => {
            // No source_kind/source_id: the row falls back to its bare `id`
            // column for identity (calendarEntries.ts), but is still
            // non-writable since analyzeCalendarEditability requires both.
            const el = getByTestId(`calendar-entry-${item.key}`);
            expect(el.className).toContain("not-writable");
        }, { timeout: 15000 });

        destroyCalendarUndoManager(projectDoc);
    });
});
