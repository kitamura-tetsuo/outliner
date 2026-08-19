// One project-level lifecycle that keeps `calendarScheduleIndex` current
// (#4981).
//
// The indicator lives on the outline item, so its correctness must not depend
// on whether a calendar block happens to be mounted somewhere on the page —
// and it must not cost a query per item either. So exactly one session runs
// every calendar of the project, over a window wide enough that "is this item
// scheduled?" has a stable answer, and publishes the result into the index.
//
// Refreshes are event-driven throughout (AGENTS.md §11): the `calendars`
// registry is observed for query/role/timezone/name edits and for calendars
// created or deleted, and the outline tree is observed for the data changes a
// drag, a resize, a cleared date or a deleted item make. Nothing polls. Tree
// events are filtered down to the fields a published membership can depend on
// (`touchesScheduleRelevantFields`), so writing a comment or a vote — which
// neither a query nor an occurrence expansion can see — costs nothing.
//
// The refresh is debounced by `REQUERY_DEBOUNCE_MS`, the same delay a table
// view uses after a Yjs change: the `outline_items` projection applies its own
// pending keys through `enqueueWrite`, and the queue is FIFO, so a query
// enqueued after that flush was scheduled reads the updated rows.

import type { Project } from "$shared/app-schema";
import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { ORDERED_TREE_KEY } from "../yjstable/itemsRelation";
import { projectSchemaName } from "../yjstable/sqlNames";
import { createTableEngineSession, type TableEngineSession } from "../yjstable/tableEngine";
import { REQUERY_DEBOUNCE_MS } from "../yjstable/tableSyncAdapter";
import { buildCalendarEntries } from "./calendarEntries";
import { runCalendarQuery } from "./calendarQueryRunner";
import {
    type CalendarMembership,
    type CalendarScheduleIndex,
    calendarScheduleIndex,
    MAX_INDEXED_OCCURRENCES,
    selectRelevantOccurrences,
    toScheduleOccurrence,
} from "./calendarScheduleIndex.svelte";
import { listCalendars, observeCalendars } from "./calendarService";
import { resolveOutlineItemId } from "./calendarSourceIdentity";
import { resolveCalendarTimezone } from "./calendarTimezone";

const logger = getLogger("calendarMembershipService");

/**
 * How far back the membership window reaches. Far enough that an item
 * scheduled earlier this month still shows as scheduled, short enough that
 * the index does not accumulate a project's whole history.
 */
export const MEMBERSHIP_WINDOW_PAST_MS = 31 * 86_400_000;
/** How far forward it reaches: a year, so a future plan is not invisible today. */
export const MEMBERSHIP_WINDOW_FUTURE_MS = 366 * 86_400_000;

export function membershipWindow(nowMs: number): { startUtcMs: number; endUtcMs: number; } {
    return {
        startUtcMs: nowMs - MEMBERSHIP_WINDOW_PAST_MS,
        endUtcMs: nowMs + MEMBERSHIP_WINDOW_FUTURE_MS,
    };
}

/**
 * The item fields a calendar's published memberships can depend on: the ones
 * `outline_items` projects as columns, so a query can select or filter on
 * them (`COLUMN_TO_FIELD` in itemsRelation.ts, plus the structural recurrence
 * markers), and `recurrenceExdate`, which no column carries but
 * `expandItemOccurrencesWithOverrides` reads straight off the item — deleting
 * one occurrence of a recurring plan writes only that array, and the
 * indicator has to lose the occurrence for it.
 *
 * Everything else an item carries — comments, votes, attachments, aliases,
 * its component type — can change neither, so writing one must not cost every
 * calendar of the project a re-run.
 */
const SCHEDULE_RELEVANT_ITEM_FIELDS: ReadonlySet<string> = new Set([
    "text",
    "due",
    "done",
    "tags",
    "allDay",
    "start",
    "duration",
    "rrule",
    "recurrenceDtstart",
    "recurrenceTimezone",
    "recurrenceExdate",
    "recurrenceParentId",
    "recurrenceOccurrenceId",
]);

/**
 * Whether a batch of outline-tree events could have changed what a calendar
 * publishes: an item added, removed or reparented, or a schedule-relevant
 * field written.
 *
 * `yjs-orderedtree` nests an item one level below its tree key — the node is
 * a wrapper map of `value` (the item's own fields) and `_parentHistory` — so
 * a field write arrives as `[key, "value"]` with the field in `changes.keys`,
 * and an edit inside a field (typing into the item's `Y.Text`) as
 * `[key, "value", field]`.
 */
function touchesScheduleRelevantFields(events: Y.YEvent<Y.AbstractType<unknown>>[]): boolean {
    for (const event of events) {
        // Nodes added to or removed from the tree.
        if (event.path.length === 0) return true;
        // The wrapper itself: a reparent, or a whole value map replaced.
        if (event.path.length === 1) return true;
        // `_parentHistory` is a move, which changes `parent_id`/`page_id`.
        if (String(event.path[1]) !== "value") return true;
        if (event.path.length === 2) {
            for (const key of event.changes.keys.keys()) {
                if (SCHEDULE_RELEVANT_ITEM_FIELDS.has(String(key))) return true;
            }
            continue;
        }
        if (SCHEDULE_RELEVANT_ITEM_FIELDS.has(String(event.path[2]))) return true;
    }
    return false;
}

export interface CalendarMembershipIndexer {
    /** Run every calendar's query now and publish the result. Exposed for tests. */
    refresh: () => Promise<void>;
    dispose: () => void;
}

export interface MembershipIndexingOptions {
    index?: CalendarScheduleIndex;
    session?: Pick<TableEngineSession, "resolveRelation"> & { dispose?: () => void; };
    now?: () => number;
}

/**
 * Start indexing `project`'s calendar memberships. Callers normally use
 * `acquireCalendarMembershipIndexing`, which shares one indexer per project.
 */
export function startCalendarMembershipIndexing(
    project: Project,
    projectId?: string,
    options: MembershipIndexingOptions = {},
): CalendarMembershipIndexer {
    const index = options.index ?? calendarScheduleIndex;
    const now = options.now ?? (() => Date.now());
    const pgSchema = projectSchemaName(projectId);
    // A session passed in by a test belongs to that test; only a session this
    // indexer created is disposed with it.
    const session = options.session ?? createTableEngineSession({ projectDoc: project.ydoc, projectId });
    const ownsSession = options.session === undefined;
    const treeMap = project.ydoc.getMap(ORDERED_TREE_KEY);

    let disposed = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const hasItem = (itemId: string): boolean => {
        try {
            if (typeof project.tree.hasNode === "function") return project.tree.hasNode(itemId);
            return project.tree.computedMap?.has(itemId) ?? treeMap.has(itemId);
        } catch {
            return false;
        }
    };

    async function refresh(): Promise<void> {
        if (disposed) return;
        const round = ++generation;
        const nowMs = now();
        const indexWindow = membershipWindow(nowMs);
        const range = { start: new Date(indexWindow.startUtcMs), end: new Date(indexWindow.endUtcMs) };
        const calendars = listCalendars(project);

        index.retainCalendars(calendars.map((c) => c.id));

        for (const { id: calendarId, settings } of calendars) {
            const timeZone = resolveCalendarTimezone(settings.timezone);
            const source = { calendarId, calendarName: settings.name, timeZone };

            if (!settings.query.trim()) {
                if (disposed || round !== generation) return;
                index.publishCalendar(source, new Map());
                continue;
            }

            const outcome = await runCalendarQuery(session, pgSchema, settings.query, range, timeZone);
            if (disposed || round !== generation) return;
            if (!outcome.result) {
                // A calendar whose query is broken contributes nothing rather
                // than keeping stale memberships alive.
                logger.debug({ calendarId, error: outcome.error }, "calendar membership query failed");
                index.publishCalendar(source, new Map());
                continue;
            }

            const entries = buildCalendarEntries(outcome.result, settings, timeZone, project, indexWindow);
            const occurrencesByItem = new Map<string, ReturnType<typeof toScheduleOccurrence>[]>();
            for (const entry of entries) {
                const itemId = resolveOutlineItemId(entry, hasItem);
                if (!itemId) continue;
                const list = occurrencesByItem.get(itemId);
                if (list) list.push(toScheduleOccurrence(entry));
                else occurrencesByItem.set(itemId, [toScheduleOccurrence(entry)]);
            }

            const memberships = new Map<string, CalendarMembership>();
            for (const [itemId, occurrences] of occurrencesByItem) {
                const selected = selectRelevantOccurrences(occurrences, nowMs, MAX_INDEXED_OCCURRENCES);
                memberships.set(itemId, {
                    calendarId,
                    calendarName: settings.name,
                    timeZone,
                    occurrences: selected.occurrences,
                    hiddenOccurrenceCount: selected.hiddenOccurrenceCount,
                });
            }
            index.publishCalendar(source, memberships);
        }
    }

    function scheduleRefresh(): void {
        if (disposed) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            void refresh().catch((err) => logger.warn({ err }, "calendar membership refresh failed"));
        }, REQUERY_DEBOUNCE_MS);
    }

    const treeObserver = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
        if (touchesScheduleRelevantFields(events)) scheduleRefresh();
    };
    treeMap.observeDeep(treeObserver);
    const unobserveCalendars = observeCalendars(project, scheduleRefresh);

    void refresh().catch((err) => logger.warn({ err }, "initial calendar membership refresh failed"));

    return {
        refresh,
        dispose() {
            if (disposed) return;
            disposed = true;
            if (timer !== undefined) clearTimeout(timer);
            treeMap.unobserveDeep(treeObserver);
            unobserveCalendars();
            for (const { id } of listCalendars(project)) index.removeCalendar(id);
            if (ownsSession) session.dispose?.();
        },
    };
}

interface SharedIndexer {
    indexer: CalendarMembershipIndexer;
    refs: number;
}

const sharedIndexers = new Map<string, SharedIndexer>();

/**
 * Share one indexer per project across every view that needs it — navigating
 * between two pages of the same project must not tear the index down and
 * rebuild it. Returns the release function for the caller's own reference.
 */
export function acquireCalendarMembershipIndexing(project: Project, projectId?: string): () => void {
    const key = `${projectId ?? ""}:${project.ydoc.guid}`;
    let shared = sharedIndexers.get(key);
    if (!shared) {
        shared = { indexer: startCalendarMembershipIndexing(project, projectId), refs: 0 };
        sharedIndexers.set(key, shared);
    }
    shared.refs++;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const current = sharedIndexers.get(key);
        if (!current) return;
        current.refs--;
        if (current.refs > 0) return;
        sharedIndexers.delete(key);
        current.indexer.dispose();
    };
}

/** Test hook: drop every shared indexer (module-scoped state must not leak). */
export function resetCalendarMembershipIndexingForTests(): void {
    for (const [key, shared] of [...sharedIndexers]) {
        sharedIndexers.delete(key);
        shared.indexer.dispose();
    }
}
