// Which calendar rows offer navigation to their source outline item (#4982).
//
// Same real-PGlite harness as CalendarView.test.ts, and nothing here is
// mocked at all — this covers exactly the decision CalendarView owns: a row
// is navigable when its `source_id` resolves to a live node of the project
// tree, and not otherwise. `source_kind` cannot decide it, since it is a
// query-chosen literal rather than an enum.
//
// The navigation itself — routing, ancestor expansion, scroll and focus — is
// exercised for real in outlineItemNavigation.test.ts and end to end in
// client/e2e/new/cal-open-source-*.spec.ts.

import { configure, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { createCalendar, destroyCalendarUndoManager } from "../../services/calendar/calendarService";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import CalendarView from "./CalendarView.svelte";

configure({ asyncUtilTimeout: 15000 });

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

describe("CalendarView source navigation", { timeout: 30000 }, () => {
    it("marks a timed entry backed by an outline item as navigable", async () => {
        const projectId = "proj-calendar-open-source-timed";
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

        const { getByTestId, unmount } = render(CalendarView, { props: { project, projectId, calendarId } });

        let entry!: HTMLElement;
        await waitFor(() => {
            entry = getByTestId(`calendar-entry-item:${item.key}`);
        });
        // `source_kind` here is the literal "item", which names no relation —
        // navigability follows the resolvable `source_id`, not the label.
        expect(entry.getAttribute("data-navigable")).toBe("true");

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });

    it("marks an all-day entry navigable in month view too", async () => {
        const projectId = "proj-calendar-open-source-month";
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

        const { getByTestId, unmount } = render(CalendarView, { props: { project, projectId, calendarId } });

        let entry!: HTMLElement;
        await waitFor(() => {
            entry = getByTestId(`calendar-entry-item:${item.key}`);
        });
        expect(entry.getAttribute("data-navigable")).toBe("true");

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });

    it("leaves a row whose source_id names no outline item non-navigable", async () => {
        const projectId = "proj-calendar-open-source-foreign";
        const { projectDoc, project, page } = seedProject(projectId);
        const item = new Items(projectDoc, project.tree, page.key).addNode("tester");
        item.text = "Generated";
        item.start = `${todayIso()}T09:00:00.000Z`;
        item.allDay = false;

        // Addressable as far as the query is concerned (both identity columns
        // present), but the identity names a row of some other relation — the
        // shape a table-derived half of a UNION has.
        const calendarId = createCalendar(project, {
            name: "Cal",
            query: "SELECT id, text AS title, all_day, start_at, "
                + "'generated' AS source_kind, 'generated-row-1' AS source_id FROM outline_items",
            roleTitle: "title",
            roleStart: "start_at",
            roleAllDay: "all_day",
        });

        const { getByTestId, unmount } = render(CalendarView, { props: { project, projectId, calendarId } });

        let entry!: HTMLElement;
        await waitFor(() => {
            entry = getByTestId("calendar-entry-generated:generated-row-1");
        });
        expect(entry.getAttribute("data-navigable")).toBeNull();

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });

    it("leaves a row carrying no source identity at all non-navigable", async () => {
        const projectId = "proj-calendar-open-source-unaddressable";
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

        const { getByTestId, unmount } = render(CalendarView, { props: { project, projectId, calendarId } });

        let entry!: HTMLElement;
        await waitFor(() => {
            // No source columns: the row falls back to its bare `id` for a
            // layout key, but carries no source identity to navigate by.
            entry = getByTestId(`calendar-entry-${item.key}`);
        });
        expect(entry.getAttribute("data-navigable")).toBeNull();

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });
});
