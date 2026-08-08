import type { Locator, Page } from "@playwright/test";

/** Viewport point for a touch gesture. */
export interface TouchPointXY {
    x: number;
    y: number;
}

/**
 * Real touch input for E2E tests.
 *
 * Playwright's `page.touchscreen` only exposes `tap()`, which cannot express a
 * long press or a drag. These helpers dispatch raw touch input through CDP so the
 * renderer produces genuine `pointerdown`/`pointermove`/`pointerup` events with
 * `pointerType === "touch"` -- the same events a finger produces -- rather than
 * synthetic events built in page script.
 */
export class TouchGestures {
    /** Long press must comfortably exceed LONG_PRESS_MS in client/src/lib/touchTextSelection.ts. */
    static readonly LONG_PRESS_HOLD_MS = 800;

    /** Presses and holds at a point, then lifts without moving. */
    static async longPress(page: Page, point: TouchPointXY, holdMs = TouchGestures.LONG_PRESS_HOLD_MS): Promise<void> {
        await TouchGestures.longPressAndDrag(page, point, [], holdMs);
    }

    /**
     * Presses and holds at `from`, then drags through `waypoints` before lifting.
     * Each waypoint is delivered as its own `touchMove`, matching a finger's travel.
     *
     * `waypoints` may be a function, resolved after the hold: entering edit mode grows
     * the pressed item (its raw text and control characters become visible) and pushes
     * the items below it down, so a target measured before the press has moved by the
     * time the drag starts. A real finger aims at where the item is now, and so must a
     * test.
     */
    static async longPressAndDrag(
        page: Page,
        from: TouchPointXY,
        waypoints: TouchPointXY[] | (() => Promise<TouchPointXY[]>),
        holdMs = TouchGestures.LONG_PRESS_HOLD_MS,
    ): Promise<void> {
        const client = await page.context().newCDPSession(page);
        try {
            await client.send("Input.dispatchTouchEvent", {
                type: "touchStart",
                touchPoints: [{ x: from.x, y: from.y }],
            });

            // Rest in place long enough for the long-press timer to fire.
            await page.waitForTimeout(holdMs);

            const resolved = typeof waypoints === "function" ? await waypoints() : waypoints;
            for (const point of resolved) {
                await client.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{ x: point.x, y: point.y }],
                });
                await page.waitForTimeout(50);
            }

            await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } finally {
            await client.detach();
        }
    }

    /** Pans a finger without pausing, the gesture the browser must keep as a scroll. */
    static async pan(page: Page, from: TouchPointXY, to: TouchPointXY, steps = 8): Promise<void> {
        const client = await page.context().newCDPSession(page);
        try {
            await client.send("Input.dispatchTouchEvent", {
                type: "touchStart",
                touchPoints: [{ x: from.x, y: from.y }],
            });

            for (let step = 1; step <= steps; step++) {
                const ratio = step / steps;
                await client.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{
                        x: from.x + (to.x - from.x) * ratio,
                        y: from.y + (to.y - from.y) * ratio,
                    }],
                });
                await page.waitForTimeout(16);
            }

            await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } finally {
            await client.detach();
        }
    }

    /** Centre of a locator's bounding box, offset horizontally by a fraction of its width. */
    static pointInBox(
        box: { x: number; y: number; width: number; height: number; },
        widthRatio: number,
    ): TouchPointXY {
        return { x: box.x + box.width * widthRatio, y: box.y + box.height / 2 };
    }

    /**
     * A point inside a single rendered character of an item's text.
     *
     * The `.item-text` span stretches the full row width on mobile, so a fraction of its
     * bounding box says nothing about which character sits there. Measuring the character
     * itself with a Range keeps the expected caret offset exact in a proportional font.
     *
     * @param textEl The `.item-text` locator.
     * @param index Index of the character to aim at.
     * @param widthRatio Where inside that character to land (0 = its left edge).
     */
    static async pointInCharacter(textEl: Locator, index: number, widthRatio = 0.3): Promise<TouchPointXY> {
        return await textEl.evaluate((element, [charIndex, ratio]) => {
            const node = element.firstChild;
            if (!node) throw new Error("Item text has no text node to measure");

            const range = document.createRange();
            range.setStart(node, charIndex);
            range.setEnd(node, charIndex + 1);
            const rect = range.getBoundingClientRect();

            return { x: rect.left + rect.width * ratio, y: rect.top + rect.height / 2 };
        }, [index, widthRatio] as const);
    }
}
