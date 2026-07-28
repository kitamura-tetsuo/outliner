// Conversions between a millisecond length and the two textual duration
// shapes this feature touches:
//   - Postgres' own default ("postgres") INTERVAL output style, which a
//     calendar query result carries (e.g. "1 day 02:03:04") — parsed so the
//     grid can lay out an entry read back from a query;
//   - the ISO 8601 subset `Item.duration` stores (`PnDTnHnMnS`, per
//     shared/src/utils/isoDuration.ts) — formatted so a resize can write it
//     back through the relation (itemsRelation.ts's `duration` column writes
//     this string straight onto the item's field, unparsed).
//
// Both directions are approximate for year/month components (365/30-day
// lengths), matching `parseIsoDurationMs` — adequate for a calendar's own
// range math, not for exact calendar arithmetic.

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

const UNIT_RE = /(-?\d+)\s+(years?|mons?|days?)/gi;
const TIME_RE = /(-?\d+):(\d{2}):(\d{2})(?:\.(\d+))?/;

/**
 * Parse Postgres' default INTERVAL text output into a millisecond length.
 * Returns `undefined` for an empty, null, or unrecognized string.
 */
export function parsePgIntervalMs(text: string | null | undefined): number | undefined {
    if (!text) return undefined;
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    let ms = 0;
    let matchedAnything = false;

    for (const m of trimmed.matchAll(UNIT_RE)) {
        matchedAnything = true;
        const n = Number(m[1]);
        const unit = m[2].toLowerCase();
        if (unit.startsWith("year")) ms += n * MS_PER_YEAR;
        else if (unit.startsWith("mon")) ms += n * MS_PER_MONTH;
        else ms += n * MS_PER_DAY;
    }

    const timeMatch = TIME_RE.exec(trimmed);
    if (timeMatch) {
        matchedAnything = true;
        const negative = timeMatch[1].startsWith("-");
        const hours = Math.abs(Number(timeMatch[1]));
        const minutes = Number(timeMatch[2]);
        const seconds = Number(timeMatch[3]);
        const fraction = timeMatch[4] ? Number(`0.${timeMatch[4]}`) : 0;
        const timeMs = (hours * 3600 + minutes * 60 + seconds + fraction) * MS_PER_SECOND;
        ms += negative ? -timeMs : timeMs;
    }

    return matchedAnything ? ms : undefined;
}

/**
 * Render a non-negative millisecond length as the ISO 8601 duration subset
 * `Item.duration` stores. Sub-second precision is dropped (rounded to the
 * nearest second) since drag/resize interaction never needs finer than that.
 */
export function msToIsoDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const remAfterDays = totalSeconds % 86400;
    const hours = Math.floor(remAfterDays / 3600);
    const minutes = Math.floor((remAfterDays % 3600) / 60);
    const seconds = remAfterDays % 60;

    let out = "P";
    if (days > 0) out += `${days}D`;
    if (hours > 0 || minutes > 0 || seconds > 0) {
        out += "T";
        if (hours > 0) out += `${hours}H`;
        if (minutes > 0) out += `${minutes}M`;
        if (seconds > 0) out += `${seconds}S`;
    }
    return out === "P" ? "PT0S" : out;
}
