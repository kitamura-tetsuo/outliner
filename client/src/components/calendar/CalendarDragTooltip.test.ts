import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/svelte";
import CalendarDragTooltip from "./CalendarDragTooltip.svelte";

describe("CalendarDragTooltip", () => {
    beforeAll(() => {
        global.ResizeObserver = class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as any;
    });

    afterAll(() => {
        delete (global as any).ResizeObserver;
    });

    it("renders label and applies coordinates", () => {
        const { getByTestId, unmount } = render(CalendarDragTooltip, {
            label: "Test Label",
            clientX: 100,
            clientY: 200,
        });

        const tooltip = getByTestId("calendar-drag-tooltip");
        expect(tooltip.textContent?.trim()).toBe("Test Label");
        expect(tooltip.style.left).toBe("112px");
        expect(tooltip.style.top).toBe("212px");
        unmount();
    });
});
