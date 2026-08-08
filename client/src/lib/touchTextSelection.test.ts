import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    findWordBoundaries,
    LONG_PRESS_MS,
    TOUCH_SLOP_PX,
    type TouchPoint,
    type TouchPointerInput,
    TouchSelectionController,
} from "./touchTextSelection";

describe("findWordBoundaries", () => {
    it("selects the word under the offset", () => {
        expect(findWordBoundaries("Hello World", 2)).toEqual({ start: 0, end: 5 });
        expect(findWordBoundaries("Hello World", 8)).toEqual({ start: 6, end: 11 });
    });

    it("pulls a caret resting just after a word back onto that word", () => {
        // Offset 5 sits on the space, but the finger was on the trailing edge of "Hello".
        expect(findWordBoundaries("Hello World", 5)).toEqual({ start: 0, end: 5 });
    });

    it("selects the whole word when the offset is at the end of the text", () => {
        expect(findWordBoundaries("Hello World", 11)).toEqual({ start: 6, end: 11 });
    });

    it("selects a whitespace run when the finger is inside one", () => {
        expect(findWordBoundaries("a   b", 2)).toEqual({ start: 1, end: 4 });
    });

    it("selects a punctuation run rather than merging it with neighbouring words", () => {
        expect(findWordBoundaries("foo -- bar", 4)).toEqual({ start: 4, end: 6 });
    });

    it("treats digits and underscores as word characters", () => {
        expect(findWordBoundaries("item_42 next", 3)).toEqual({ start: 0, end: 7 });
    });

    it("treats CJK characters as word characters", () => {
        expect(findWordBoundaries("テスト word", 1)).toEqual({ start: 0, end: 3 });
    });

    it("returns an empty range for empty text", () => {
        expect(findWordBoundaries("", 0)).toEqual({ start: 0, end: 0 });
    });

    it("clamps out-of-range offsets", () => {
        expect(findWordBoundaries("abc", 99)).toEqual({ start: 0, end: 3 });
        expect(findWordBoundaries("abc", -5)).toEqual({ start: 0, end: 3 });
    });
});

describe("TouchSelectionController", () => {
    let onTap: ReturnType<typeof vi.fn<(point: TouchPoint) => void>>;
    let onLongPress: ReturnType<typeof vi.fn<(point: TouchPoint) => void>>;
    let onExtend: ReturnType<typeof vi.fn<(point: TouchPoint) => void>>;
    let onSelectionEnd: ReturnType<typeof vi.fn<() => void>>;
    let controller: TouchSelectionController;

    /** Builds a touch PointerEvent-like input; `overrides` covers the non-touch cases. */
    function touch(x: number, y: number, overrides: Partial<TouchPointerInput> = {}): TouchPointerInput {
        return { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, ...overrides };
    }

    beforeEach(() => {
        vi.useFakeTimers();
        onTap = vi.fn<(point: TouchPoint) => void>();
        onLongPress = vi.fn<(point: TouchPoint) => void>();
        onExtend = vi.fn<(point: TouchPoint) => void>();
        onSelectionEnd = vi.fn<() => void>();
        controller = new TouchSelectionController({ onTap, onLongPress, onExtend, onSelectionEnd });
    });

    afterEach(() => {
        controller.destroy();
        vi.useRealTimers();
    });

    it("ignores mouse and pen pointers so the desktop path is untouched", () => {
        expect(controller.pointerDown(touch(10, 10, { pointerType: "mouse" }))).toBe(false);
        expect(controller.pointerDown(touch(10, 10, { pointerType: "pen" }))).toBe(false);
        expect(controller.isTracking).toBe(false);

        vi.advanceTimersByTime(LONG_PRESS_MS * 2);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it("ignores non-primary pointers (second finger of a pinch)", () => {
        expect(controller.pointerDown(touch(10, 10, { isPrimary: false }))).toBe(false);
        expect(controller.isTracking).toBe(false);
    });

    it("places the caret on a tap that does not move", () => {
        controller.pointerDown(touch(30, 40));
        expect(controller.pointerUp(touch(31, 41))).toBe(true);

        expect(onTap).toHaveBeenCalledTimes(1);
        expect(onTap).toHaveBeenCalledWith({ clientX: 31, clientY: 41 });
        expect(onLongPress).not.toHaveBeenCalled();
        expect(onSelectionEnd).not.toHaveBeenCalled();
    });

    it("does not place a caret when the finger panned past the slop threshold", () => {
        controller.pointerDown(touch(30, 40));
        controller.pointerMove(touch(30, 40 + TOUCH_SLOP_PX + 5));
        expect(controller.pointerUp(touch(30, 40 + TOUCH_SLOP_PX + 5))).toBe(false);

        expect(onTap).not.toHaveBeenCalled();
    });

    it("keeps tracking a tap while movement stays within the slop threshold", () => {
        controller.pointerDown(touch(30, 40));
        expect(controller.pointerMove(touch(33, 42))).toBe(false);
        controller.pointerUp(touch(33, 42));

        expect(onTap).toHaveBeenCalledWith({ clientX: 33, clientY: 42 });
    });

    it("selects the word after a long press at the press origin", () => {
        controller.pointerDown(touch(30, 40));
        vi.advanceTimersByTime(LONG_PRESS_MS);

        expect(onLongPress).toHaveBeenCalledWith({ clientX: 30, clientY: 40 });
        expect(controller.isSelecting).toBe(true);
    });

    it("cancels the long press when the finger pans away first (scroll wins)", () => {
        controller.pointerDown(touch(30, 40));
        controller.pointerMove(touch(30, 200));
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);

        expect(onLongPress).not.toHaveBeenCalled();
        expect(controller.isSelecting).toBe(false);
    });

    it("extends the selection on every move after the long press", () => {
        controller.pointerDown(touch(30, 40));
        vi.advanceTimersByTime(LONG_PRESS_MS);

        expect(controller.pointerMove(touch(80, 40))).toBe(true);
        expect(controller.pointerMove(touch(120, 90))).toBe(true);

        expect(onExtend).toHaveBeenNthCalledWith(1, { clientX: 80, clientY: 40 });
        expect(onExtend).toHaveBeenNthCalledWith(2, { clientX: 120, clientY: 90 });
    });

    it("ends the selection drag on pointerup without placing a caret", () => {
        controller.pointerDown(touch(30, 40));
        vi.advanceTimersByTime(LONG_PRESS_MS);
        controller.pointerMove(touch(120, 40));

        expect(controller.pointerUp(touch(120, 40))).toBe(true);
        expect(onSelectionEnd).toHaveBeenCalledTimes(1);
        expect(onTap).not.toHaveBeenCalled();
        expect(controller.isSelecting).toBe(false);
    });

    it("ends the selection drag on cancel", () => {
        controller.pointerDown(touch(30, 40));
        vi.advanceTimersByTime(LONG_PRESS_MS);
        controller.cancel();

        expect(onSelectionEnd).toHaveBeenCalledTimes(1);
        expect(controller.isTracking).toBe(false);
    });

    it("does not report a selection end for a cancelled press that never selected", () => {
        controller.pointerDown(touch(30, 40));
        controller.cancel();

        expect(onSelectionEnd).not.toHaveBeenCalled();
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it("ignores events from a pointer it is not tracking", () => {
        controller.pointerDown(touch(30, 40));
        vi.advanceTimersByTime(LONG_PRESS_MS);

        expect(controller.pointerMove(touch(90, 40, { pointerId: 2 }))).toBe(false);
        expect(controller.pointerUp(touch(90, 40, { pointerId: 2 }))).toBe(false);
        expect(onExtend).not.toHaveBeenCalled();
        expect(onSelectionEnd).not.toHaveBeenCalled();
    });

    it("does not fire a long press after the gesture ended", () => {
        controller.pointerDown(touch(30, 40));
        controller.pointerUp(touch(30, 40));
        vi.advanceTimersByTime(LONG_PRESS_MS * 2);

        expect(onLongPress).not.toHaveBeenCalled();
        expect(onTap).toHaveBeenCalledTimes(1);
    });
});
