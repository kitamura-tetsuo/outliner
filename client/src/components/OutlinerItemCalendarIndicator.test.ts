// The indicator reads the real `calendarScheduleIndex` (no mocking, AGENTS.md
// §2): publishing into the index is exactly what the project-level indexer
// does, so these tests exercise the production reactivity path.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import { type CalendarMembership, calendarScheduleIndex } from "../services/calendar/calendarScheduleIndex.svelte";
import OutlinerItemCalendarIndicator from "./OutlinerItemCalendarIndicator.svelte";

const MARCH_16_0900_UTC = Date.parse("2026-03-16T09:00:00.000Z");

function membership(overrides: Partial<CalendarMembership> = {}): CalendarMembership {
    return {
        calendarId: "cal-work",
        calendarName: "Work",
        timeZone: "Asia/Tokyo",
        occurrences: [{
            entryKey: "items:item-1",
            title: "Standup",
            allDay: false,
            startMs: MARCH_16_0900_UTC,
            durationMs: 1_800_000,
        }],
        hiddenOccurrenceCount: 0,
        ...overrides,
    };
}

function publish(
    source: { calendarId: string; calendarName: string; timeZone: string; },
    itemId: string,
    m: CalendarMembership,
) {
    calendarScheduleIndex.publishCalendar(source, new Map([[itemId, m]]));
}

// Module-scoped singleton: reset per test so state never leaks (AGENTS.md §2).
beforeEach(() => calendarScheduleIndex.reset());

describe("OutlinerItemCalendarIndicator", () => {
    it("renders nothing for an item no calendar shows", () => {
        const { queryByTestId } = render(OutlinerItemCalendarIndicator, { itemId: "item-1" });
        expect(queryByTestId("calendar-indicator-item-1")).toBeNull();
    });

    it("appears when the item joins a calendar and names the schedule accessibly", async () => {
        const { queryByTestId, findByTestId } = render(OutlinerItemCalendarIndicator, { itemId: "item-1" });
        expect(queryByTestId("calendar-indicator-item-1")).toBeNull();

        publish({ calendarId: "cal-work", calendarName: "Work", timeZone: "Asia/Tokyo" }, "item-1", membership());

        const button = await findByTestId("calendar-indicator-item-1");
        // The calendar's own zone, not the runner's local one: 09:00Z is 18:00 in Tokyo.
        expect(button.getAttribute("aria-label")).toBe(
            "Scheduled on 1 calendar. Work: Mon, Mar 16 18:00 – 18:30 (30m) (Asia/Tokyo)",
        );
    });

    it("shows the details on keyboard focus, not on hover only", async () => {
        publish({ calendarId: "cal-work", calendarName: "Work", timeZone: "Asia/Tokyo" }, "item-1", membership());
        const { findByTestId, queryByTestId } = render(OutlinerItemCalendarIndicator, { itemId: "item-1" });

        const button = await findByTestId("calendar-indicator-item-1");
        expect(queryByTestId("calendar-schedule-tooltip-item-1")).toBeNull();

        await fireEvent.focus(button);
        const tooltip = await findByTestId("calendar-schedule-tooltip-item-1");
        expect(tooltip.textContent).toContain("Work: Mon, Mar 16 18:00 – 18:30 (30m) (Asia/Tokyo)");
        expect(button.getAttribute("aria-describedby")).toBe("calendar-schedule-tooltip-item-1");

        await fireEvent.blur(button);
        await waitFor(() => expect(queryByTestId("calendar-schedule-tooltip-item-1")).toBeNull());

        await fireEvent.mouseEnter(button);
        await findByTestId("calendar-schedule-tooltip-item-1");
        await fireEvent.mouseLeave(button);
        await waitFor(() => expect(queryByTestId("calendar-schedule-tooltip-item-1")).toBeNull());
    });

    it("lists every calendar an item belongs to, and counts them on the icon", async () => {
        publish({ calendarId: "cal-work", calendarName: "Work", timeZone: "Asia/Tokyo" }, "item-1", membership());
        publish(
            { calendarId: "cal-home", calendarName: "Home", timeZone: "UTC" },
            "item-1",
            membership({
                calendarId: "cal-home",
                calendarName: "Home",
                timeZone: "UTC",
                occurrences: [{
                    entryKey: "items:item-1-allday",
                    title: "Standup",
                    allDay: true,
                    startMs: Date.parse("2026-03-16T00:00:00.000Z"),
                }],
            }),
        );

        const { findByTestId } = render(OutlinerItemCalendarIndicator, { itemId: "item-1" });
        const button = await findByTestId("calendar-indicator-item-1");
        expect(button.getAttribute("data-calendar-count")).toBe("2");

        await fireEvent.focus(button);
        const tooltip = await findByTestId("calendar-schedule-tooltip-item-1");
        expect(tooltip.textContent).toContain("Home: Mon, Mar 16 (all day) (UTC)");
        expect(tooltip.textContent).toContain("Work: Mon, Mar 16 18:00 – 18:30 (30m) (Asia/Tokyo)");
    });

    it("disappears reactively once no calendar shows the item any more", async () => {
        const source = { calendarId: "cal-work", calendarName: "Work", timeZone: "Asia/Tokyo" };
        publish(source, "item-1", membership());
        const { findByTestId, queryByTestId } = render(OutlinerItemCalendarIndicator, { itemId: "item-1" });
        await findByTestId("calendar-indicator-item-1");

        calendarScheduleIndex.publishCalendar(source, new Map());
        await waitFor(() => expect(queryByTestId("calendar-indicator-item-1")).toBeNull());
    });

    it("reports the occurrences it did not list rather than dropping them silently", async () => {
        publish(
            { calendarId: "cal-work", calendarName: "Work", timeZone: "UTC" },
            "item-1",
            membership({ timeZone: "UTC", hiddenOccurrenceCount: 12 }),
        );
        const { findByTestId } = render(OutlinerItemCalendarIndicator, { itemId: "item-1" });
        await fireEvent.focus(await findByTestId("calendar-indicator-item-1"));
        const tooltip = await findByTestId("calendar-schedule-tooltip-item-1");
        expect(tooltip.textContent).toContain("Work: +12 more occurrences");
    });
});
