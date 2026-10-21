// Production-path coverage for SQL projection classification: the query is
// parsed by CalendarView, then a real lane gesture dispatches through the
// relation provider and the workspace Undo router.
import { configure, fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { createCalendar, destroyCalendarUndoManager } from "../../services/calendar/calendarService";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import { store } from "../../stores/store.svelte";
import CalendarView from "./CalendarView.svelte";

configure({ asyncUtilTimeout: 15000 });
let counter = 0;

function fixture(query: string, groupAxis: string) {
    const projectId = `calendar-projection-write-${counter++}`;
    const projectDoc = new Y.Doc({ guid: projectId });
    const project = Project.fromDoc(projectDoc);
    const page = new Items(projectDoc, project.tree, "root").addNode("tester");
    page.text = "Tasks";
    const item = new Items(projectDoc, project.tree, page.key).addNode("tester");
    item.text = "Movable";
    item.start = `${new Date().toISOString().slice(0, 10)}T09:00:00.000Z`;
    item.allDay = false;
    item.tags = ["work"];
    // This is the supported application origin for outline history. It creates
    // the same ITEMS_RELATION_ORIGIN-aware manager used in a real workspace.
    store.project = project;
    const calendarId = createCalendar(project, {
        name: "Cal",
        query,
        roleTitle: "title",
        roleStart: "start_at",
        roleAllDay: "all_day",
        groupAxes: [groupAxis],
        laneOrder: ["work", "urgent"],
        showEmptyLanes: true,
    });
    return { projectId, projectDoc, project, item, calendarId };
}

async function dropToUrgent(f: ReturnType<typeof fixture>) {
    const component = render(CalendarView, {
        props: { project: f.project, projectId: f.projectId, calendarId: f.calendarId },
    });
    await waitFor(() => expect(component.getByTestId(`calendar-entry-outline_items:${f.item.key}`)).toBeTruthy());
    return component;
}

afterEach(async () => {
    store.project = undefined;
    await resetTableEngineForTests();
    globalUndoRouter.clear();
});
afterAll(resetPgliteForTests);

describe("Calendar parsed projection write boundary", { timeout: 30000 }, () => {
    it("writes a quoted Unicode alias through the real provider and records Undo despite lexical noise", async () => {
        const f = fixture(
            `SELECT id, text AS title, all_day, start_at, tags AS "分類", 'from, join' AS note, `
                + `'outline_items' AS source_kind, id AS source_id FROM outline_items /* group by, join */ `
                + `WHERE text <> $noise$from, join$noise$`,
            "分類",
        );
        const component = await dropToUrgent(f);
        globalUndoRouter.clear();
        await fireEvent.dragStart(component.getByTestId(`calendar-entry-lane-handle-outline_items:${f.item.key}`));
        await fireEvent.drop(component.getByTestId("calendar-lane-urgent"));
        await waitFor(() => expect(f.item.tags).toEqual(["urgent"]));
        expect(globalUndoRouter.undoDepth).toBe(1);
        globalUndoRouter.undo();
        expect(f.item.tags).toEqual(["work"]);
        destroyCalendarUndoManager(f.projectDoc);
    });

    it("preserves same-column UNION ALL writes and their history", async () => {
        const base =
            "id, text AS title, all_day, start_at, tags AS lanes, 'outline_items' AS source_kind, id AS source_id";
        const f = fixture(
            `SELECT ${base} FROM outline_items WHERE text = 'Movable' UNION ALL SELECT ${base} FROM outline_items WHERE text <> 'Movable'`,
            "lanes",
        );
        const component = await dropToUrgent(f);
        globalUndoRouter.clear();
        await fireEvent.dragStart(component.getByTestId(`calendar-entry-lane-handle-outline_items:${f.item.key}`));
        await fireEvent.drop(component.getByTestId("calendar-lane-urgent"));
        await waitFor(() => expect(f.item.tags).toEqual(["urgent"]));
        expect(globalUndoRouter.undoDepth).toBe(1);
        destroyCalendarUndoManager(f.projectDoc);
    });

    it.each([
        ["same-name calculation", "tags || '[]' AS tags", "tags"],
        ["ambiguous output", "tags AS lanes, tags || '[]' AS lanes", "lanes"],
        ["disagreeing UNION branch", undefined, "lanes"],
    ])("refuses %s without changing source data or history", async (_name, projection, axis) => {
        const identity = "id, text AS title, all_day, start_at, 'outline_items' AS source_kind, id AS source_id";
        const query = projection
            ? `SELECT ${identity}, ${projection} FROM outline_items`
            : `SELECT ${identity}, tags AS lanes FROM outline_items UNION ALL SELECT ${identity}, text AS ignored FROM outline_items WHERE false`;
        const f = fixture(query, axis!);
        const component = await dropToUrgent(f);
        globalUndoRouter.clear();
        expect(component.queryByTestId(`calendar-entry-lane-handle-outline_items:${f.item.key}`)).toBeNull();
        await fireEvent.drop(component.getByTestId("calendar-lane-urgent"));
        expect(f.item.tags).toEqual(["work"]);
        expect(globalUndoRouter.undoDepth).toBe(0);
        destroyCalendarUndoManager(f.projectDoc);
    });
});
