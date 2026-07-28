// Minimal ISO 8601 duration parser, for the subset `Item.duration` actually
// stores (`PnYnMnDTnHnMnS`, no week designator combined with other units).
// Postgres does this parsing itself when a duration string is cast to
// INTERVAL; this exists because occurrence expansion (§6.2) needs the same
// value as a plain millisecond length, entirely outside SQL.

const ISO_DURATION_RE =
    /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_YEAR = 365 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;

/**
 * Parses an ISO 8601 duration string into a millisecond length.
 * Years/months use the calendar-approximate 365/30-day lengths — adequate
 * for bounding an occurrence's end for range filtering, not for exact
 * calendar arithmetic.
 * Returns `undefined` for an empty, malformed, or all-zero string.
 */
export function parseIsoDurationMs(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const m = ISO_DURATION_RE.exec(value.trim());
    if (!m) return undefined;

    const [, years, months, days, hours, minutes, seconds] = m;
    if (!years && !months && !days && !hours && !minutes && !seconds) return undefined;

    const ms = Number(years ?? 0) * MS_PER_YEAR
        + Number(months ?? 0) * MS_PER_MONTH
        + Number(days ?? 0) * MS_PER_DAY
        + Number(hours ?? 0) * MS_PER_HOUR
        + Number(minutes ?? 0) * MS_PER_MINUTE
        + Number(seconds ?? 0) * MS_PER_SECOND;

    return ms;
}
