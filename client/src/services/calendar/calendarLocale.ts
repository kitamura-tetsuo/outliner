// Resolves the default week start (0=Sunday..6=Saturday) from the viewer's
// locale, per #4347's "defaults to the locale's first day". Only ever used
// when a calendar has no explicit `weekStart` setting — once the user (or
// `createCalendar`) sets one, it is a shared, undoable view setting
// (calendarService.ts) and this is never consulted again for that calendar.

interface LocaleWithWeekInfo extends Intl.Locale {
    weekInfo?: { firstDay: number; };
}

export function resolveDefaultWeekStart(): number {
    try {
        const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
        const info = (new Intl.Locale(locale) as LocaleWithWeekInfo).weekInfo;
        // `weekInfo.firstDay`: 1=Monday..7=Sunday (ISO). Convert to 0=Sunday..6=Saturday.
        if (info && typeof info.firstDay === "number") return info.firstDay % 7;
    } catch {
        // Unsupported locale/engine: fall through to the default below.
    }
    return 0;
}
