import { render } from "@testing-library/svelte";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import CalendarDragTooltip from "./CalendarDragTooltip.svelte";

describe("CalendarDragTooltip", () => {
    // Not a mock of any application code: jsdom implements no
    // `ResizeObserver`, which Svelte's `bind:clientWidth`/`bind:clientHeight`
    // needs. The stub reports nothing, so the component keeps the zero sizes
    // an unlaid-out jsdom element already has.
    beforeAll(() => {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as unknown as typeof ResizeObserver;
    });

    afterAll(() => {
        delete (globalThis as { ResizeObserver?: unknown; }).ResizeObserver;
    });

    it("renders the label offset from the pointer", () => {
        const { getByTestId, unmount } = render(CalendarDragTooltip, {
            label: "Thu, Aug 3 09:15 – 09:45",
            clientX: 100,
            clientY: 200,
        });

        const tooltip = getByTestId("calendar-drag-tooltip");
        expect(tooltip.textContent?.trim()).toBe("Thu, Aug 3 09:15 – 09:45");
        expect(tooltip.style.left).toBe("114px");
        expect(tooltip.style.top).toBe("214px");
        unmount();
    });

    it("keeps the pointer offset from running off the left/top edge", () => {
        const { getByTestId, unmount } = render(CalendarDragTooltip, { label: "x", clientX: -100, clientY: -100 });
        const tooltip = getByTestId("calendar-drag-tooltip");
        expect(tooltip.style.left).toBe("4px");
        expect(tooltip.style.top).toBe("4px");
        unmount();
    });

    it("clamps to the viewport when the pointer is at the right/bottom edge", () => {
        // jsdom reports 1024x768 with a zero-sized (unlaid-out) chip, so the
        // clamp is the window edge minus the 4px margin.
        const { getByTestId, unmount } = render(CalendarDragTooltip, {
            label: "Thu, Aug 3",
            clientX: 5000,
            clientY: 5000,
        });

        const tooltip = getByTestId("calendar-drag-tooltip");
        expect(tooltip.style.left).toBe(`${window.innerWidth - 4}px`);
        expect(tooltip.style.top).toBe(`${window.innerHeight - 4}px`);
        unmount();
    });
});
