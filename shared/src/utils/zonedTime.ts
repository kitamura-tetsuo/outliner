// Wall-clock <-> UTC conversion for an IANA zone, using native `Intl` only.
//
// `server/src/scheduler/schedule-indexer.ts` solves the same problem with
// `luxon`, which is a server-only dependency — the client (where calendar
// recurrence must expand) has no `luxon`. This reimplements the same
// two-pass offset-correction technique on top of `Intl.DateTimeFormat`.

/** A local wall-clock reading, with no notion of which zone it is in. */
export interface WallTime {
    year: number;
    month: number; // 1-12
    day: number;
    hour: number;
    minute: number;
    second: number;
}

const WALL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;

/** Parse `YYYY-MM-DDTHH:MM:SS[.sss]` (no `Z`/offset) into components. */
export function parseWallTime(local: string): WallTime | undefined {
    const m = WALL_TIME_RE.exec(local);
    if (!m) return undefined;
    return {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        hour: Number(m[4]),
        minute: Number(m[5]),
        second: Number(m[6]),
    };
}

/** Inverse of `parseWallTime`. */
export function formatWallTime(w: WallTime): string {
    const pad = (n: number, len = 2) => String(Math.trunc(n)).padStart(len, "0");
    return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
}

/** The zone's wall-clock reading of a UTC instant. */
export function utcMsToWallTime(utcMs: number, timeZone: string): WallTime {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const hour = get("hour");
    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        // `hourCycle: "h23"` still reports midnight as "24" in some engines.
        hour: hour === 24 ? 0 : hour,
        minute: get("minute"),
        second: get("second"),
    };
}

function wallAsUtcMs(w: WallTime): number {
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/**
 * `w`'s components read as if they were already UTC — the "floating time"
 * shape `rrule` (which has no timezone concept of its own) expects both for
 * `dtstart` and for every generated occurrence.
 */
export function wallTimeToFloatingDate(w: WallTime): Date {
    return new Date(wallAsUtcMs(w));
}

/** Inverse of `wallTimeToFloatingDate`. */
export function floatingDateToWallTime(d: Date): WallTime {
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
    };
}

/**
 * The UTC instant at which `timeZone`'s wall clock reads `w`.
 *
 * Standard two-pass technique: guess the instant by treating the wall-clock
 * reading as if it were already UTC, read the zone's actual offset at that
 * guess, and correct. A second pass re-reads the offset at the corrected
 * instant, so a DST transition landing between the guess and the correction
 * does not leave the result off by the transition's delta.
 */
export function wallTimeToUtcMs(w: WallTime, timeZone: string): number {
    const guess = wallAsUtcMs(w);
    const offsetAt = (utcMs: number) => wallAsUtcMs(utcMsToWallTime(utcMs, timeZone)) - utcMs;
    const offset1 = offsetAt(guess);
    const offset2 = offsetAt(guess - offset1);
    return guess - offset2;
}

/**
 * Whether `w` is a real local time in `timeZone` — false inside a
 * spring-forward gap, where no UTC instant reads back as `w` exactly.
 */
export function wallTimeExists(w: WallTime, timeZone: string): boolean {
    const roundTrip = utcMsToWallTime(wallTimeToUtcMs(w, timeZone), timeZone);
    return formatWallTime(roundTrip) === formatWallTime(w);
}

const FLOATING_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The UTC instant at which `timeZone`'s wall clock reaches midnight of the
 * floating date `YYYY-MM-DD`.
 *
 * An all-day entry is a floating date, not an instant
 * (docs/crdt-sql-architecture.md §6.1) — it only becomes a point on the
 * timeline once a zone is chosen, and the zone that must be chosen is the
 * view's (§6.5), never the runtime's ambient one and never UTC. Anchoring
 * such a date at UTC midnight instead puts it on the wrong day, or across
 * two days, for every viewer whose zone has a non-zero offset.
 *
 * Returns `undefined` for anything that is not a bare `YYYY-MM-DD`, so a
 * caller can fall back to instant parsing. In a zone whose midnight does not
 * exist on that date (a spring-forward gap that starts at 00:00, as in
 * America/Santiago), `wallTimeToUtcMs` lands on the first instant that day
 * does have.
 */
export function floatingDateToUtcMs(date: string, timeZone: string): number | undefined {
    const m = FLOATING_DATE_RE.exec(date.trim());
    if (!m) return undefined;
    return wallTimeToUtcMs(
        { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: 0, minute: 0, second: 0 },
        timeZone,
    );
}

/** Inverse of `floatingDateToUtcMs`: `timeZone`'s calendar date at `utcMs`. */
export function utcMsToFloatingDate(utcMs: number, timeZone: string): string {
    return formatWallTime(utcMsToWallTime(utcMs, timeZone)).slice(0, 10);
}
