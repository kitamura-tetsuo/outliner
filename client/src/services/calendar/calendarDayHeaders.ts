import { utcMsToFloatingDate, utcMsToWallTime } from "$shared/utils/zonedTime";
import { addWallDays, wallWeekday } from "./calendarGridRange";

export interface DayHeader {
    dayIndex: number;
    /** UTC instant of this column's wall-clock midnight in the calendar's zone. */
    dateUtcMs: number;
    /** 0 (Sunday) .. 6 (Saturday), in the calendar's zone. */
    weekday: number;
    /** "2026-08-17" — floating date, already zone-resolved. */
    isoDate: string;
    /** Day-of-month for the compact label. */
    dayOfMonth: number;
    /** First column of a new month, so the header can show the month name once. */
    isMonthStart: boolean;
}

export function computeDayHeaders(rangeStart: number, dayCount: number, timeZone: string): DayHeader[] {
    const headers: DayHeader[] = [];
    let currentUtcMs = rangeStart;
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
        const wallTime = utcMsToWallTime(currentUtcMs, timeZone);
        const isoDate = utcMsToFloatingDate(currentUtcMs, timeZone);
        headers.push({
            dayIndex,
            dateUtcMs: currentUtcMs,
            weekday: wallWeekday(currentUtcMs, timeZone),
            isoDate,
            dayOfMonth: wallTime.day,
            isMonthStart: wallTime.day === 1,
        });
        currentUtcMs = addWallDays(currentUtcMs, 1, timeZone);
    }
    return headers;
}
