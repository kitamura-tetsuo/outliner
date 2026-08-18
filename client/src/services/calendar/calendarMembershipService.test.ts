// Real PGlite, the real table engine session and the real `outline_items`
// projection (AGENTS.md §2), the same pattern calendarQueryRunner.test.ts
// uses: the point of this service is that a source item's calendar
// membership is derived from an actual query result, so stubbing the query
// would test nothing.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "../yjstable/tableEngine";
import { startCalendarMembershipIndexing } from "./calendarMembershipService";
import { calendarScheduleIndex } from "./calendarScheduleIndex.svelte";
import { createCalendar, deleteCalendar, destroyCalendarUndoManager, updateCalendar } from "./calendarService";

/** No provider in unit tests: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

const QUERY = "SELECT id, text AS title, all_day, start_at, duration, due, "
    + "'item' AS source_kind, id AS source_id FROM outline_items";

/** The same projection plus `rrule`, which is what makes a recurring row expand. */
const RECURRING_QUERY = "SELECT id, text AS title, all_day, start_at, duration, due, rrule, "
    + "'item' AS source_kind, id AS source_id FROM outline_items";

const ROLES = {
    roleTitle: "title",
    roleStart: "start_at",
    roleAllDay: "all_day",
    roleDuration: "duration",
    roleDue: "due",
};

function seedProject(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const project = Project.fromDoc(projectDoc);
    const page = new Items(projectDoc, project.tree, "root").addNode("tester");
    page.text = "Tasks";
    const scheduled = new Items(projectDoc, project.tree, page.key).addNode("tester");
    scheduled.text = "Standup";
    return { projectDoc, project, page, scheduled };
}

/** Today at 09:00Z, so the entry always falls inside the membership window. */
function todayAt(hourUtc: number): string {
    const d = new Date();
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
}

async function waitForIndex<T>(read: () => T, predicate: (value: T) => boolean, label: string): Promise<T> {
    const deadline = Date.now() + 20000;
    let last = read();
    while (Date.now() < deadline) {
        last = read();
        if (predicate(last)) return last;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(last)}`);
}

afterEach(async () => {
    calendarScheduleIndex.reset();
    await resetTableEngineForTests();
    globalUndoRouter.clear();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("startCalendarMembershipIndexing", { timeout: 60000 }, () => {
    it("indexes the source item behind a calendar entry, and reconciles when its date is cleared", async () => {
        const projectId = "proj-membership-basic";
        const { projectDoc, project, scheduled } = seedProject(projectId);
        scheduled.start = todayAt(9);
        scheduled.allDay = false;
        scheduled.duration = "PT30M";

        createCalendar(project, { name: "Team", query: QUERY, timezone: "Asia/Tokyo", ...ROLES });

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const indexer = startCalendarMembershipIndexing(project, projectId, { session });
        try {
            const memberships = await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 1,
                "the item to be indexed",
            );
            expect(memberships[0].calendarName).toBe("Team");
            expect(memberships[0].timeZone).toBe("Asia/Tokyo");
            expect(memberships[0].occurrences).toHaveLength(1);
            expect(memberships[0].occurrences[0].startMs).toBe(Date.parse(todayAt(9)));
            expect(memberships[0].occurrences[0].durationMs).toBe(30 * 60 * 1000);

            // Clearing the item's date drops it out of the query result, and
            // the indicator with it — no diffing by the caller.
            scheduled.start = undefined;
            scheduled.duration = undefined;
            await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 0,
                "the membership to disappear",
            );
        } finally {
            indexer.dispose();
            session.dispose();
            destroyCalendarUndoManager(projectDoc);
        }
    });

    it("keeps both memberships when one item is on two calendars, and drops one when its calendar is deleted", async () => {
        const projectId = "proj-membership-two-calendars";
        const { projectDoc, project, scheduled } = seedProject(projectId);
        scheduled.start = todayAt(9);
        scheduled.allDay = false;

        createCalendar(project, { name: "Team", query: QUERY, timezone: "UTC", ...ROLES });
        const personalId = createCalendar(project, {
            name: "Personal",
            query: QUERY,
            timezone: "America/New_York",
            ...ROLES,
        });

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const indexer = startCalendarMembershipIndexing(project, projectId, { session });
        try {
            const memberships = await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 2,
                "both memberships",
            );
            expect(memberships.map((m) => m.calendarName)).toEqual(["Personal", "Team"]);
            expect(memberships.map((m) => m.timeZone)).toEqual(["America/New_York", "UTC"]);

            deleteCalendar(project, personalId);
            const remaining = await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 1,
                "the deleted calendar's membership to be dropped",
            );
            expect(remaining[0].calendarName).toBe("Team");
        } finally {
            indexer.dispose();
            session.dispose();
            destroyCalendarUndoManager(projectDoc);
        }
    });

    it("follows a query change and never indexes a row that is not an outline item", async () => {
        const projectId = "proj-membership-query-change";
        const { projectDoc, project, scheduled } = seedProject(projectId);
        scheduled.start = todayAt(9);
        scheduled.allDay = false;

        const calendarId = createCalendar(project, { name: "Team", query: QUERY, timezone: "UTC", ...ROLES });

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const indexer = startCalendarMembershipIndexing(project, projectId, { session });
        try {
            await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 1,
                "the item to be indexed",
            );

            // A synthetic row whose source_id names nothing in the outline
            // tree: addressable, but not this item — and matching it by its
            // title would be exactly the text-based identity we refuse.
            updateCalendar(project, calendarId, {
                query: "SELECT 'Standup' AS title, NULL::boolean AS all_day, "
                    + `'${todayAt(9)}'::timestamptz AS start_at, NULL::interval AS duration, NULL::timestamptz AS due, `
                    + "'item' AS source_kind, 'not-an-item' AS source_id",
            });
            await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 0,
                "the membership to be reconciled away",
            );
            expect(calendarScheduleIndex.lookupItem("not-an-item")).toEqual([]);
        } finally {
            indexer.dispose();
            session.dispose();
            destroyCalendarUndoManager(projectDoc);
        }
    });

    it("re-runs for a scheduling change but not for an edit no query can see", async () => {
        const projectId = "proj-membership-event-filter";
        const { projectDoc, project, scheduled } = seedProject(projectId);
        scheduled.start = todayAt(9);
        scheduled.allDay = false;
        createCalendar(project, { name: "Team", query: QUERY, timezone: "UTC", ...ROLES });

        // Every refresh reads the clock exactly once, so counting reads counts
        // refreshes without reaching into the service's internals.
        let refreshes = 0;
        const now = () => {
            refreshes++;
            return Date.now();
        };
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const indexer = startCalendarMembershipIndexing(project, projectId, { session, now });
        try {
            await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 1,
                "the item to be indexed",
            );

            // A vote is not a projected column: no query result can change.
            const before = refreshes;
            scheduled.toggleVote("tester");
            await new Promise((resolve) => setTimeout(resolve, 500));
            expect(refreshes).toBe(before);

            // Moving the entry is, so this one must re-run.
            scheduled.start = todayAt(11);
            await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m[0]?.occurrences[0]?.startMs === Date.parse(todayAt(11)),
                "the rescheduled entry",
            );
            expect(refreshes).toBeGreaterThan(before);
        } finally {
            indexer.dispose();
            session.dispose();
            destroyCalendarUndoManager(projectDoc);
        }
    });

    it("lists a recurring item's occurrences, and drops one the moment it is excluded", async () => {
        const projectId = "proj-membership-recurrence";
        const { projectDoc, project, scheduled } = seedProject(projectId);
        // A daily plan anchored at 09:00 UTC: `rrule` alone makes the item
        // projected, and the query below carries the column that tells
        // `buildCalendarEntries` to expand it.
        scheduled.start = todayAt(9);
        scheduled.allDay = false;
        scheduled.duration = "PT30M";
        scheduled.rrule = "FREQ=DAILY;COUNT=5";
        scheduled.recurrenceDtstart = `${todayAt(9).slice(0, 10)}T09:00:00`;
        scheduled.recurrenceTimezone = "UTC";

        createCalendar(project, { name: "Team", query: RECURRING_QUERY, timezone: "UTC", ...ROLES });

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const indexer = startCalendarMembershipIndexing(project, projectId, { session });
        try {
            const memberships = await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => (m[0]?.occurrences.length ?? 0) > 1,
                "the recurring item's occurrences",
            );
            // The plan is one source item, so collapsing by source id would
            // show a single date; each occurrence keeps its own entry key.
            const keys = memberships[0].occurrences.map((o) => o.entryKey);
            expect(new Set(keys).size).toBe(keys.length);
            expect(memberships[0].occurrences.length + memberships[0].hiddenOccurrenceCount).toBe(5);

            // Deleting one occurrence writes only `recurrenceExdate`, which no
            // projected column carries — the indicator must still follow it.
            const excluded = memberships[0].occurrences[0].startMs!;
            scheduled.addRecurrenceExdate(new Date(excluded).toISOString().slice(0, 19));
            await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 1 && m[0].occurrences.every((o) => o.startMs !== excluded),
                "the excluded occurrence to disappear",
            );
        } finally {
            indexer.dispose();
            session.dispose();
            destroyCalendarUndoManager(projectDoc);
        }
    });

    it("removes every membership it contributed when the indexer is disposed", async () => {
        const projectId = "proj-membership-dispose";
        const { projectDoc, project, scheduled } = seedProject(projectId);
        scheduled.start = todayAt(9);
        scheduled.allDay = false;
        createCalendar(project, { name: "Team", query: QUERY, timezone: "UTC", ...ROLES });

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const indexer = startCalendarMembershipIndexing(project, projectId, { session });
        try {
            await waitForIndex(
                () => calendarScheduleIndex.lookupItem(scheduled.key),
                (m) => m.length === 1,
                "the item to be indexed",
            );
        } finally {
            indexer.dispose();
        }
        expect(calendarScheduleIndex.lookupItem(scheduled.key)).toEqual([]);
        session.dispose();
        destroyCalendarUndoManager(projectDoc);
    });
});
