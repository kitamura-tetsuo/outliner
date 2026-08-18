// Double-clicking a calendar event opens its source outline item (#4982).
//
// Same real-PGlite harness as CalendarView.test.ts (AGENTS.md §2: the table
// engine is never mocked). What *is* stubbed is only the last step —
// `navigateToOutlineItem`, which would need a mounted outliner page and
// SvelteKit routing to do anything here — so these tests still exercise the
// real decision this feature turns on: which rows are navigable, and which
// identity a double-click hands over.

import { configure, fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { createCalendar, destroyCalendarUndoManager } from "../../services/calendar/calendarService";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import CalendarView from "./CalendarView.svelte";

type NavigateToOutlineItem =
    typeof import("../../services/navigation/outlineItemNavigation.svelte")["navigateToOutlineItem"];

// `vi.hoisted`, because the mock factory below is hoisted above this file's
// own initialization and would otherwise read the binding before it exists.
const { navigateToOutlineItem } = vi.hoisted(() => ({
    navigateToOutlineItem: vi.fn<NavigateToOutlineItem>(async () => true),
}));

// Partial mock: `isOutlineItemAddressable` stays real, because "is this row an
// outline item?" is exactly what is under test here.
vi.mock("../../services/navigation/outlineItemNavigation.svelte", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../services/navigation/outlineItemNavigation.svelte")>();
    return { ...actual, navigateToOutlineItem };
});

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
    navigateToOutlineItem.mockClear();
    await resetTableEngineForTests();
    globalUndoRouter.clear();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("CalendarView source navigation", { timeout: 30000 }, () => {
    it("double-clicking a timed entry opens its source item, addressed by source_id", async () => {
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
        expect(entry.getAttribute("data-navigable")).toBe("true");

        await fireEvent.dblClick(entry);

        expect(navigateToOutlineItem).toHaveBeenCalledTimes(1);
        expect(navigateToOutlineItem.mock.calls[0][1]).toBe(item.key);

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });

    it("double-clicking an all-day entry in month view opens its source item", async () => {
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

        await fireEvent.dblClick(entry);

        expect(navigateToOutlineItem).toHaveBeenCalledTimes(1);
        expect(navigateToOutlineItem.mock.calls[0][1]).toBe(item.key);

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });

    it("a row whose source_id names no outline item is neither marked navigable nor navigates", async () => {
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

        await fireEvent.dblClick(entry);

        expect(navigateToOutlineItem).not.toHaveBeenCalled();

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });

    it("a single click on an entry does not navigate", async () => {
        const projectId = "proj-calendar-open-source-single-click";
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

        await fireEvent.click(entry);

        expect(navigateToOutlineItem).not.toHaveBeenCalled();

        destroyCalendarUndoManager(projectDoc);
        unmount();
    });
});
