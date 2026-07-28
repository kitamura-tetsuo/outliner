import { rrulestr } from "rrule";
import { getLogger } from "../logger.js";
const logger = getLogger("calendarRecurrenceExpansion");
import {
    floatingDateToWallTime,
    formatWallTime,
    parseWallTime,
    utcMsToWallTime,
    wallTimeExists,
    wallTimeToFloatingDate,
    wallTimeToUtcMs,
} from "../utils/zonedTime.js";

// Read-time occurrence expansion for a recurring item (§6.2). A recurring
// plan is never materialized into stored rows: this generates occurrences
// for a visible range only, and nothing outside it. The result is pure data
// — no Yjs, no PGlite — so it is usable from a query layer, a calendar view,
// or a test without touching either.

export interface RecurrenceRule {
    /** RFC 5545 RRULE body, no `RRULE:` prefix (`Item.rrule`). */
    rrule: string;
    /** Local wall-clock dtstart, `YYYY-MM-DDTHH:MM:SS` (`Item.recurrenceDtstart`). */
    dtstart: string;
    /** IANA zone (`Item.recurrenceTimezone`). */
    timezone: string;
    /** Cancelled occurrences, by local wall-clock dtstart (`Item.recurrenceExdate`). */
    exdate?: string[];
    /** Occurrence length in ms. Absent/0 makes every occurrence instantaneous. */
    durationMs?: number;
}

export interface RecurrenceOccurrence {
    /** Local wall-clock dtstart of this occurrence — the RECURRENCE-ID equivalent. */
    occurrenceId: string;
    startUtcMs: number;
    endUtcMs: number;
}

/**
 * `rrule`'s own iteration already stops at a rule's `COUNT`/`UNTIL`: passing
 * a wide range does not force more occurrences than the rule bounds.
 *
 * The visible range's boundaries are widened by a day in each direction
 * before being handed to `rrule` (in floating/local terms, alongside every
 * candidate occurrence — see below), so a real UTC instant that falls inside
 * the caller's range is never missed just because a DST shift moved it
 * across a floating-time boundary; occurrences are still filtered to the
 * exact requested range once each is converted to a real instant.
 */
const RANGE_PAD_MS = 24 * 60 * 60 * 1000;

/**
 * Occurrences of `rule` whose interval `[start, end)` intersects
 * `[rangeStartUtcMs, rangeEndUtcMs)`, in range order. Skips a wall-clock
 * time that does not exist in the zone (a spring-forward gap) and any
 * occurrence recorded in `exdate`.
 */
export function expandRecurrence(
    rule: RecurrenceRule,
    rangeStartUtcMs: number,
    rangeEndUtcMs: number,
): RecurrenceOccurrence[] {
    const dtstartWall = parseWallTime(rule.dtstart);
    if (!dtstartWall) return [];

    const floatingDtstart = wallTimeToFloatingDate(dtstartWall);

    let parsed;
    try {
        parsed = rrulestr(rule.rrule, { dtstart: floatingDtstart });
    } catch (_e) {
            logger.warn({ err: _e }, "Silenced error");
        return [];
    }

    const floatingRangeStart = wallTimeToFloatingDate(
        utcMsToWallTime(rangeStartUtcMs - RANGE_PAD_MS, rule.timezone),
    );
    const floatingRangeEnd = wallTimeToFloatingDate(
        utcMsToWallTime(rangeEndUtcMs + RANGE_PAD_MS, rule.timezone),
    );

    const exdateSet = new Set((rule.exdate ?? []).map((s) => s.trim()));
    const durationMs = rule.durationMs ?? 0;
    const occurrences: RecurrenceOccurrence[] = [];

    for (const floating of parsed.between(floatingRangeStart, floatingRangeEnd, true)) {
        const wall = floatingDateToWallTime(floating);
        if (!wallTimeExists(wall, rule.timezone)) continue;

        const occurrenceId = formatWallTime(wall);
        if (exdateSet.has(occurrenceId)) continue;

        const startUtcMs = wallTimeToUtcMs(wall, rule.timezone);
        const endUtcMs = startUtcMs + durationMs;
        if (endUtcMs < rangeStartUtcMs || startUtcMs > rangeEndUtcMs) continue;

        occurrences.push({ occurrenceId, startUtcMs, endUtcMs });
    }

    return occurrences;
}

/** An override row: an ordinary item that replaces one virtual occurrence. */
export interface RecurrenceOverride {
    recurrenceOccurrenceId: string;
}

/**
 * Drops every virtual occurrence an override already replaces — the
 * "not double-rendered alongside its virtual counterpart" rule. Overrides
 * are returned as-is: the caller already has their real row (an ordinary
 * item), this only decides which virtual occurrences must not also render.
 */
export function excludeOverriddenOccurrences(
    occurrences: RecurrenceOccurrence[],
    overrides: RecurrenceOverride[],
): RecurrenceOccurrence[] {
    const overridden = new Set(overrides.map((o) => o.recurrenceOccurrenceId));
    return occurrences.filter((o) => !overridden.has(o.occurrenceId));
}
