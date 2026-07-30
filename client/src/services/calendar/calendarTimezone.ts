// Resolve and validate a calendar's view timezone
// (docs/crdt-sql-architecture.md §6.5).
//
// The view's timezone is an explicit, visible property rather than an
// ambient one: absent means "the viewer's local zone", resolved here rather
// than left implicit, so the UI always has a definite zone to display and
// the query runner always has a definite zone to set the SQL session to.

/** Resolve a calendar's stored timezone, falling back to the viewer's local zone when absent. */
export function resolveCalendarTimezone(timezone?: string): string {
    if (timezone) return timezone;
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (_e) {
        return "UTC";
    }
}

/** Whether `timezone` is a zone the runtime's IANA database recognizes. */
export function isValidIanaTimeZone(timezone: string): boolean {
    if (!timezone) return false;
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
    } catch (_e) {
        return false;
    }
}

/**
 * The list of IANA zones the runtime knows about, for a timezone picker.
 * `Intl.supportedValuesOf` is unavailable in a handful of older engines —
 * callers fall back to a plain text input when this returns an empty list.
 */
export function listSupportedTimeZones(): string[] {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[]; })
        .supportedValuesOf;
    if (typeof supportedValuesOf !== "function") return [];
    try {
        return supportedValuesOf("timeZone");
    } catch (_e) {
        return [];
    }
}
