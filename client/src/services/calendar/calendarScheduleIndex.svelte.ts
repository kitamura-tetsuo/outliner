// Reverse index: outline item -> the calendars that currently show it (#4981).
//
// A calendar entry is a *view* of a source record produced by a SQL query, so
// an outline item has no stored "I am on calendar X" field to render from.
// The indicator on the item still has to be authoritative and reactive, and
// it must not cost a query per row — 500 outline items cannot mean 500 SQL
// sessions.
//
// This module is the meeting point. Producers (calendarMembershipService.ts,
// which owns one project-level query lifecycle) publish a whole calendar's
// memberships at once; consumers (OutlinerItemCalendarIndicator.svelte) read
// one item's memberships in O(1). Publishing is *reconciling*: a calendar's
// previous contribution is replaced wholesale, so an item that dropped out of
// the query result loses its indicator without anyone having to diff rows,
// and deleting the calendar removes every membership it contributed.
//
// Reactivity follows AGENTS.md §11's mirror pattern, with the mirror kept as
// an index instead of a list: the lookup map is a `SvelteMap` (plain `$state`
// does not proxy `Map`), so a consumer's `$derived` tracks the one key it
// read, and a `version` counter alongside it makes "did anything change at
// all" observable — which is also what proves a republish of identical data
// causes no churn.

import { SvelteMap } from "svelte/reactivity";
import type { CalendarEntry } from "./calendarEntries";

/** One occurrence of an item on a calendar: the scheduling data the tooltip shows. */
export interface ScheduleOccurrence {
    /** `CalendarEntry.key` — distinct per recurrence occurrence, so two never collapse. */
    entryKey: string;
    title: string;
    allDay?: boolean;
    startMs?: number;
    durationMs?: number;
    dueMs?: number;
}

/** One calendar an item appears on, with the occurrences that put it there. */
export interface CalendarMembership {
    calendarId: string;
    calendarName: string;
    /** The owning calendar's view timezone — never the viewer's local zone. */
    timeZone: string;
    /** Nearest-to-now first (see `selectRelevantOccurrences`). */
    occurrences: ScheduleOccurrence[];
    /** Matched occurrences beyond `MAX_INDEXED_OCCURRENCES`, reported rather than dropped silently. */
    hiddenOccurrenceCount: number;
}

/** Identity of the calendar a batch of memberships came from. */
export interface CalendarMembershipSource {
    calendarId: string;
    calendarName: string;
    timeZone: string;
}

/**
 * How many occurrences of one item on one calendar the index keeps. A daily
 * recurrence expands to hundreds of occurrences inside the indexing window;
 * the indicator's job is "this item is scheduled, here is when", so the
 * nearest few answer it and the rest are counted, never silently discarded
 * (`hiddenOccurrenceCount`).
 */
export const MAX_INDEXED_OCCURRENCES = 3;

export function toScheduleOccurrence(entry: CalendarEntry): ScheduleOccurrence {
    return {
        entryKey: entry.key,
        title: entry.title,
        allDay: entry.allDay,
        startMs: entry.startMs,
        durationMs: entry.durationMs,
        dueMs: entry.dueMs,
    };
}

/** The instant an occurrence is sorted and compared by: its start, else its deadline. */
export function occurrenceAnchorMs(occurrence: ScheduleOccurrence): number | undefined {
    return occurrence.startMs ?? occurrence.dueMs;
}

/**
 * Keep the occurrences nearest to `nowMs` — the current and upcoming ones a
 * user asks the indicator about — in chronological order, and report how many
 * were left out. An occurrence with no time at all sorts last: it says the
 * item is on the calendar without saying when.
 */
export function selectRelevantOccurrences(
    occurrences: ScheduleOccurrence[],
    nowMs: number,
    limit: number = MAX_INDEXED_OCCURRENCES,
): { occurrences: ScheduleOccurrence[]; hiddenOccurrenceCount: number; } {
    const sorted = [...occurrences].sort((a, b) => {
        const aMs = occurrenceAnchorMs(a);
        const bMs = occurrenceAnchorMs(b);
        if (aMs === undefined && bMs === undefined) return a.entryKey.localeCompare(b.entryKey);
        if (aMs === undefined) return 1;
        if (bMs === undefined) return -1;
        return aMs - bMs;
    });
    if (sorted.length <= limit) return { occurrences: sorted, hiddenOccurrenceCount: 0 };

    // The first occurrence that has not finished before `nowMs` anchors the
    // window, so a long-running recurrence shows "now and next" rather than
    // its first occurrence from months ago.
    const upcomingIndex = sorted.findIndex((o) => {
        const anchor = occurrenceAnchorMs(o);
        return anchor === undefined || anchor + (o.durationMs ?? 0) >= nowMs;
    });
    const start = upcomingIndex < 0
        ? Math.max(0, sorted.length - limit)
        : Math.min(upcomingIndex, Math.max(0, sorted.length - limit));
    return {
        occurrences: sorted.slice(start, start + limit),
        hiddenOccurrenceCount: sorted.length - limit,
    };
}

function sameOccurrence(a: ScheduleOccurrence, b: ScheduleOccurrence): boolean {
    return a.entryKey === b.entryKey
        && a.title === b.title
        && a.allDay === b.allDay
        && a.startMs === b.startMs
        && a.durationMs === b.durationMs
        && a.dueMs === b.dueMs;
}

function sameMembership(a: CalendarMembership, b: CalendarMembership): boolean {
    return a.calendarId === b.calendarId
        && a.calendarName === b.calendarName
        && a.timeZone === b.timeZone
        && a.hiddenOccurrenceCount === b.hiddenOccurrenceCount
        && a.occurrences.length === b.occurrences.length
        && a.occurrences.every((o, i) => sameOccurrence(o, b.occurrences[i]));
}

function sameMembershipMap(
    a: Map<string, CalendarMembership>,
    b: Map<string, CalendarMembership>,
): boolean {
    if (a.size !== b.size) return false;
    for (const [itemId, membership] of a) {
        const other = b.get(itemId);
        if (!other || !sameMembership(membership, other)) return false;
    }
    return true;
}

const EMPTY: CalendarMembership[] = [];

class CalendarScheduleIndex {
    /**
     * Bumped whenever any membership changed, so a consumer can depend on the
     * index as a whole. `byItem` is a `SvelteMap`, so a `$derived` lookup also
     * tracks the single key it read; the counter is what tests assert against
     * to prove a republish of identical data causes no churn.
     */
    version = $state(0);

    /** calendarId -> (itemId -> that calendar's membership for the item). */
    private byCalendar = new SvelteMap<string, Map<string, CalendarMembership>>();
    /** itemId -> every calendar's membership for it, calendar name ascending. */
    private byItem = new SvelteMap<string, CalendarMembership[]>();

    /**
     * Replace everything `source.calendarId` contributes. `memberships` is
     * keyed by outline item id; an item absent from it loses this calendar's
     * membership, which is what makes "no longer matches the query" reactive.
     */
    publishCalendar(source: CalendarMembershipSource, memberships: Map<string, CalendarMembership>): void {
        const previous = this.byCalendar.get(source.calendarId);
        if (previous && sameMembershipMap(previous, memberships)) return;

        // Both sides are rebuilt: the items this publish carries, and the ones
        // the previous publish carried but this one dropped. Rebuilding an
        // item twice is idempotent, so no de-duplication is needed.
        const touched = [...memberships.keys(), ...(previous ? [...previous.keys()] : [])];

        if (memberships.size === 0) this.byCalendar.delete(source.calendarId);
        else this.byCalendar.set(source.calendarId, new SvelteMap(memberships));

        this.rebuildItems(touched);
        this.version++;
    }

    /** Drop a calendar entirely: deleted, converted back to text, or gone from the project. */
    removeCalendar(calendarId: string): void {
        const previous = this.byCalendar.get(calendarId);
        if (!previous) return;
        const touched = [...previous.keys()];
        this.byCalendar.delete(calendarId);
        this.rebuildItems(touched);
        this.version++;
    }

    /** Keep only the given calendars; used when the project's calendar registry shrinks. */
    retainCalendars(calendarIds: Iterable<string>): void {
        const keep = [...calendarIds];
        for (const calendarId of [...this.byCalendar.keys()]) {
            if (!keep.includes(calendarId)) this.removeCalendar(calendarId);
        }
    }

    /** Every calendar the item currently appears on. Constant-time. */
    lookupItem(itemId: string): CalendarMembership[] {
        return this.byItem.get(itemId) ?? EMPTY;
    }

    /** Test/teardown hook: module-scoped singletons must not leak between tests. */
    reset(): void {
        this.byCalendar.clear();
        this.byItem.clear();
        this.version++;
    }

    private rebuildItems(itemIds: string[]): void {
        for (const itemId of itemIds) {
            const merged: CalendarMembership[] = [];
            for (const perItem of this.byCalendar.values()) {
                const membership = perItem.get(itemId);
                if (membership) merged.push(membership);
            }
            if (merged.length === 0) {
                this.byItem.delete(itemId);
                continue;
            }
            merged.sort((a, b) =>
                a.calendarName.localeCompare(b.calendarName) || a.calendarId.localeCompare(b.calendarId)
            );
            this.byItem.set(itemId, merged);
        }
    }
}

export const calendarScheduleIndex = new CalendarScheduleIndex();
export type { CalendarScheduleIndex };
