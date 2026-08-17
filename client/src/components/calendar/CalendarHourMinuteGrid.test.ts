// Interaction tests for the Hour Map renderer (#4972). The geometry itself is
// covered by calendarHourMinuteLayout.test.ts; what matters here is that the
// component turns that geometry into the right DOM and reports the right
// start/duration back to `CalendarView` — it never writes anything itself.

import { fireEvent, render } from "@testing-library/svelte";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import { layoutHourMinuteGrid } from "../../services/calendar/calendarHourMinuteLayout";
import CalendarHourMinuteGrid from "./CalendarHourMinuteGrid.svelte";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const RANGE_START = Date.parse("2026-03-10T00:00:00Z");
const RANGE_END = RANGE_START + DAY_MS;

// Stub row/track geometry: jsdom reports every rect as zero, so the drag maths
// (pixels -> minutes, pointer Y -> hour row) would have nothing to work with.
const ROW_HEIGHT = 30;
const TRACK_WIDTH = 600; // 10px per minute

// Neither of these stubs mocks application code: jsdom implements no pointer
// capture and no `ResizeObserver` (which the drag tooltip's
// `bind:clientWidth` needs), and the component only requires them not to throw.
beforeAll(() => {
    (Element.prototype as unknown as { setPointerCapture: () => void; }).setPointerCapture = () => {};
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

afterAll(() => {
    delete (globalThis as { ResizeObserver?: unknown; }).ResizeObserver;
});

function at(hhmm: string): number {
    return Date.parse(`2026-03-10T${hhmm}:00Z`);
}

function timed(key: string, start: string, durationMinutes: number, title = key): CalendarEntry {
    return {
        key,
        title,
        raw: {},
        allDay: false,
        startMs: at(start),
        durationMs: durationMinutes * MINUTE_MS,
    };
}

function stubGeometry(container: HTMLElement) {
    container.querySelectorAll<HTMLElement>(".hour-row").forEach((row, index) => {
        const top = index * ROW_HEIGHT;
        row.getBoundingClientRect = () =>
            ({
                top,
                bottom: top + ROW_HEIGHT,
                left: 0,
                right: TRACK_WIDTH + 48,
                width: TRACK_WIDTH + 48,
                height: ROW_HEIGHT,
            }) as DOMRect;
        const track = row.querySelector<HTMLElement>(".minute-track");
        if (track) {
            track.getBoundingClientRect = () =>
                ({
                    top,
                    bottom: top + ROW_HEIGHT,
                    left: 48,
                    right: 48 + TRACK_WIDTH,
                    width: TRACK_WIDTH,
                    height: ROW_HEIGHT,
                }) as DOMRect;
        }
    });
}

/** Client Y in the middle of hour row `hour` (rows are one per hour on an ordinary day). */
function yOfHour(hour: number): number {
    return hour * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/** Client X for `minutes` of horizontal travel. */
function xOfMinutes(minutes: number): number {
    return (minutes / 60) * TRACK_WIDTH;
}

function setup(entries: CalendarEntry[], overrides: Record<string, unknown> = {}) {
    const handlers = {
        onDragMove: vi.fn(),
        onDragEnd: vi.fn(),
        onDragCancel: vi.fn(),
        onResizeMove: vi.fn(),
        onResizeEnd: vi.fn(),
        onKeyboardMove: vi.fn(),
        onKeyboardResize: vi.fn(),
        onDeleteRequest: vi.fn(),
    };
    const result = render(CalendarHourMinuteGrid, {
        props: {
            layout: layoutHourMinuteGrid(entries, RANGE_START, RANGE_END, "UTC", {
                workingHoursStartMinutes: 9 * 60,
                workingHoursEndMinutes: 18 * 60,
            }),
            timeZone: "UTC",
            isStartWritable: () => true,
            isDurationWritable: () => true,
            isDeletable: () => true,
            ...handlers,
            ...overrides,
        },
    });
    stubGeometry(result.container);
    return { ...result, ...handlers };
}

/** Drag `el` from `(fromX, fromY)` to `(toX, toY)` through the window listeners. */
async function drag(el: HTMLElement, fromX: number, fromY: number, toX: number, toY: number) {
    await fireEvent(
        el,
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: fromX, clientY: fromY }),
    );
    await fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: toX, clientY: toY }));
    await fireEvent(window, new MouseEvent("pointerup", { bubbles: true, clientX: toX, clientY: toY }));
}

describe("CalendarHourMinuteGrid", () => {
    it("renders 24 hour rows and places a fragment at its exact minute offset and width", () => {
        const { getByTestId, container } = setup([timed("a", "09:15", 30)]);
        expect(container.querySelectorAll(".hour-row")).toHaveLength(24);
        const fragment = getByTestId("calendar-entry-a");
        expect(fragment.getAttribute("style")).toContain("left: 25%"); // 15/60
        expect(fragment.getAttribute("style")).toContain("width: 50%"); // 30/60
        expect(fragment.getAttribute("data-hour")).toBe("9");
    });

    it("wraps a multi-hour event into connected fragments carrying the title exactly once", () => {
        const { getByTestId, container } = setup([timed("a", "09:45", 95, "Meeting")]);
        const fragments = container.querySelectorAll<HTMLElement>('[data-entry-key="a"]');
        expect([...fragments].map((f) => f.dataset.hour)).toEqual(["9", "10", "11"]);
        // The first and middle fragments continue into the next row; the middle
        // and last continue from the previous one.
        expect([...fragments].map((f) => f.classList.contains("continues-right"))).toEqual([true, true, false]);
        expect([...fragments].map((f) => f.classList.contains("continues-left"))).toEqual([false, true, true]);
        // One inline title, on the entry's addressable (anchor) fragment.
        expect(container.querySelectorAll('[data-testid="calendar-entry-title"]')).toHaveLength(1);
        expect(getByTestId("calendar-entry-a").textContent).toContain("Meeting");
    });

    it("keeps the title hidden but focusable when no fragment is wide enough for it", () => {
        const { container } = setup([timed("a", "09:55", 10, "Standup")]);
        const title = container.querySelector<HTMLElement>('[data-testid="calendar-entry-title"]')!;
        expect(title.classList.contains("visually-hidden")).toBe(true);
        expect(title.getAttribute("tabindex")).toBe("0");
    });

    it("stacks overlapping entries in separate lanes and grows only that hour's row", () => {
        const { getByTestId, container } = setup([timed("a", "10:00", 60), timed("b", "10:10", 30)]);
        expect(getByTestId("calendar-hour-row-10").getAttribute("data-lane-count")).toBe("2");
        expect(getByTestId("calendar-hour-row-11").getAttribute("data-lane-count")).toBe("1");
        const [first, second] = container.querySelectorAll<HTMLElement>(".fragment");
        expect(first.style.top).not.toBe(second.style.top);
        // Full minute width preserved for the hour-long entry despite the overlap.
        expect(getByTestId("calendar-entry-a").getAttribute("style")).toContain("width: 100%");
    });

    it("keeps all-day and due-only entries in the band, out of the hour geometry", () => {
        const allDay: CalendarEntry = { key: "ad", title: "Conference", raw: {}, allDay: true, startMs: RANGE_START };
        const milestone: CalendarEntry = { key: "due", title: "Ship", raw: {}, dueMs: RANGE_START + 10 * HOUR_MS };
        const { getByTestId, container } = setup([allDay, milestone]);
        expect(getByTestId("calendar-entry-allday-ad")).toBeTruthy();
        expect(getByTestId("calendar-entry-milestone-due")).toBeTruthy();
        expect(container.querySelectorAll(".fragment")).toHaveLength(0);
    });

    it("marks the working-hours interval on the rows it covers", () => {
        const { getByTestId, queryByTestId } = setup([]);
        expect(getByTestId("calendar-hour-working-band-9")).toBeTruthy();
        expect(queryByTestId("calendar-hour-working-band-8")).toBeNull();
    });

    it("moves an entry across an hour boundary to the right", async () => {
        const { getByTestId, onDragEnd } = setup([timed("a", "10:50", 20)]);
        await drag(getByTestId("calendar-entry-a"), 0, yOfHour(10), xOfMinutes(20), yOfHour(10));
        expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }), at("11:10"));
    });

    it("moves an entry across an hour boundary to the left", async () => {
        const { getByTestId, onDragEnd } = setup([timed("a", "10:10", 20)]);
        await drag(getByTestId("calendar-entry-a"), xOfMinutes(30), yOfHour(10), xOfMinutes(10), yOfHour(10));
        expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }), at("09:50"));
    });

    it("resolves a combined vertical/horizontal drag into one wall-clock destination", async () => {
        const { getByTestId, onDragMove, onDragEnd } = setup([timed("a", "10:50", 20)]);
        await drag(getByTestId("calendar-entry-a"), 0, yOfHour(10), xOfMinutes(20), yOfHour(13));
        expect(onDragMove).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }), at("14:10"));
        expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }), at("14:10"));
    });

    it("resizes across hour boundaries from the last fragment's handle", async () => {
        const { getByTestId, onResizeEnd } = setup([timed("a", "09:50", 20)]);
        // The handle lives on the final fragment (the 10:00 row here).
        await drag(getByTestId("calendar-entry-resize-a"), 0, yOfHour(10), xOfMinutes(20), yOfHour(12));
        // 10:10 -> 12:30, so a 20-minute event becomes 2h40m.
        expect(onResizeEnd).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }), 160 * MINUTE_MS);
    });

    it("does not start a drag, or offer a resize handle, for a non-writable entry", async () => {
        const { getByTestId, queryByTestId, onDragEnd, onDragMove } = setup([timed("a", "10:00", 30)], {
            isStartWritable: () => false,
            isDurationWritable: () => false,
        });
        const fragment = getByTestId("calendar-entry-a");
        expect(fragment.classList.contains("not-writable")).toBe(true);
        expect(queryByTestId("calendar-entry-resize-a")).toBeNull();
        await drag(fragment, 0, yOfHour(10), xOfMinutes(20), yOfHour(11));
        expect(onDragMove).not.toHaveBeenCalled();
        expect(onDragEnd).not.toHaveBeenCalled();
    });

    it("moves with arrow keys: minutes horizontally, whole hour rows vertically", async () => {
        const { container, onKeyboardMove } = setup([timed("a", "10:50", 20)]);
        const title = container.querySelector<HTMLElement>('[data-testid="calendar-entry-title"]')!;
        await fireEvent.keyDown(title, { key: "ArrowRight" });
        expect(onKeyboardMove).toHaveBeenLastCalledWith(expect.objectContaining({ key: "a" }), at("11:05"));
        await fireEvent.keyDown(title, { key: "ArrowDown" });
        expect(onKeyboardMove).toHaveBeenLastCalledWith(expect.objectContaining({ key: "a" }), at("11:50"));
        await fireEvent.keyDown(title, { key: "ArrowUp" });
        expect(onKeyboardMove).toHaveBeenLastCalledWith(expect.objectContaining({ key: "a" }), at("09:50"));
    });

    it("resizes with arrow keys on the handle without moving the start", async () => {
        const { getByTestId, onKeyboardResize, onKeyboardMove } = setup([timed("a", "10:50", 20)]);
        await fireEvent.keyDown(getByTestId("calendar-entry-resize-a"), { key: "ArrowRight" });
        expect(onKeyboardResize).toHaveBeenLastCalledWith(expect.objectContaining({ key: "a" }), 35 * MINUTE_MS);
        await fireEvent.keyDown(getByTestId("calendar-entry-resize-a"), { key: "ArrowDown" });
        expect(onKeyboardResize).toHaveBeenLastCalledWith(expect.objectContaining({ key: "a" }), 80 * MINUTE_MS);
        expect(onKeyboardMove).not.toHaveBeenCalled();
    });

    it("requests a delete from the entry's anchor fragment", async () => {
        const { getByTestId, onDeleteRequest } = setup([timed("a", "10:00", 30)]);
        await fireEvent.click(getByTestId("calendar-entry-delete-a"));
        expect(onDeleteRequest).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }));
    });
});
