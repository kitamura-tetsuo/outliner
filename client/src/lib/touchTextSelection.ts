/**
 * Touch caret placement and long-press text selection for the outliner.
 *
 * The outliner renders item text as a `div` while the real input is the hidden
 * `.global-textarea`, so the OS selection UI cannot drive it. This module owns the
 * touch gesture state machine (tap -> caret, long-press -> word, drag -> extend) and
 * is deliberately free of Svelte and DOM-query dependencies so it can be unit tested
 * directly; the component supplies the DOM-facing callbacks.
 *
 * The mouse path is untouched: the controller ignores any pointer whose `pointerType`
 * is not `"touch"`.
 */

/** Time a finger must rest before a long-press selects the word underneath. */
export const LONG_PRESS_MS = 500;

/** Movement (px) tolerated before a press stops counting as a tap/long-press. */
export const TOUCH_SLOP_PX = 10;

/** A viewport point produced by a pointer gesture. */
export interface TouchPoint {
    clientX: number;
    clientY: number;
}

/** The subset of `PointerEvent` the controller reads. */
export interface TouchPointerInput extends TouchPoint {
    pointerId: number;
    pointerType: string;
    isPrimary?: boolean;
}

export interface TouchSelectionHandlers {
    /** A finger tapped without moving: place the caret at the point. */
    onTap(point: TouchPoint): void;
    /** A finger rested in place: select the word under the point and enter drag-extend mode. */
    onLongPress(point: TouchPoint): void;
    /** The finger moved while a selection drag is active: extend the selection to the point. */
    onExtend(point: TouchPoint): void;
    /** The selection drag finished (finger lifted or gesture cancelled). */
    onSelectionEnd(): void;
    /** Overrides for the gesture thresholds (tests). */
    longPressMs?: number;
    slopPx?: number;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const SPACE_CHAR = /\s/;

type CharClass = "word" | "space" | "other";

function classifyChar(char: string): CharClass {
    if (SPACE_CHAR.test(char)) return "space";
    return WORD_CHAR.test(char) ? "word" : "other";
}

/**
 * Finds the boundaries of the "word" surrounding `offset`, matching what browsers
 * select on a double-click or long-press: a run of word characters, a run of
 * whitespace, or a run of punctuation.
 *
 * A caret sitting just past the end of a word (the common result of long-pressing
 * near a word's trailing edge) is pulled back onto that word rather than selecting
 * the following space.
 */
export function findWordBoundaries(text: string, offset: number): { start: number; end: number; } {
    const length = text.length;
    if (length === 0) return { start: 0, end: 0 };

    let index = Math.max(0, Math.min(offset, length));

    if (index >= length) {
        // Past the last character there is nothing under the finger: use the character before it.
        index = length - 1;
    } else if (index > 0 && classifyChar(text[index]) !== "word" && classifyChar(text[index - 1]) === "word") {
        // Sitting on a non-word character directly after a word selects that word instead.
        index -= 1;
    }

    const charClass = classifyChar(text[index]);

    let start = index;
    while (start > 0 && classifyChar(text[start - 1]) === charClass) start -= 1;

    let end = index + 1;
    while (end < length && classifyChar(text[end]) === charClass) end += 1;

    return { start, end };
}

/**
 * Tracks a single touch gesture over an item and turns it into caret/selection intents.
 *
 * Usage: forward `pointerdown` / `pointermove` / `pointerup` / `pointercancel` to the
 * matching methods. Non-touch pointers are ignored so the existing mouse handlers keep
 * full ownership of desktop behaviour.
 */
export class TouchSelectionController {
    private readonly handlers: TouchSelectionHandlers;
    private readonly longPressMs: number;
    private readonly slopPx: number;

    private pointerId: number | undefined;
    private startX = 0;
    private startY = 0;
    private movedBeyondSlop = false;
    private selecting = false;
    private longPressTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(handlers: TouchSelectionHandlers) {
        this.handlers = handlers;
        this.longPressMs = handlers.longPressMs ?? LONG_PRESS_MS;
        this.slopPx = handlers.slopPx ?? TOUCH_SLOP_PX;
    }

    /** True while a long-press selection drag is in progress. */
    get isSelecting(): boolean {
        return this.selecting;
    }

    /** True while a touch gesture is being tracked (press, drag, or selection). */
    get isTracking(): boolean {
        return this.pointerId !== undefined;
    }

    /**
     * @returns true when the gesture is now being tracked (touch pointer), false otherwise.
     */
    pointerDown(event: TouchPointerInput): boolean {
        if (event.pointerType !== "touch") return false;
        if (event.isPrimary === false) return false;

        // A second finger landing mid-gesture ends the current one rather than confusing it.
        if (this.pointerId !== undefined && this.pointerId !== event.pointerId) {
            this.cancel();
        }

        this.pointerId = event.pointerId;
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.movedBeyondSlop = false;
        this.selecting = false;

        this.clearLongPressTimer();
        this.longPressTimer = setTimeout(() => {
            this.longPressTimer = undefined;
            if (this.pointerId === undefined || this.movedBeyondSlop) return;
            this.selecting = true;
            this.handlers.onLongPress({ clientX: this.startX, clientY: this.startY });
        }, this.longPressMs);

        return true;
    }

    /**
     * @returns true when the move was consumed as a selection drag, meaning the caller
     * must suppress the browser's own scroll/selection gesture for it.
     */
    pointerMove(event: TouchPointerInput): boolean {
        if (event.pointerType !== "touch") return false;
        if (this.pointerId === undefined || this.pointerId !== event.pointerId) return false;

        if (this.selecting) {
            this.handlers.onExtend({ clientX: event.clientX, clientY: event.clientY });
            return true;
        }

        const dx = event.clientX - this.startX;
        const dy = event.clientY - this.startY;
        if (!this.movedBeyondSlop && Math.hypot(dx, dy) > this.slopPx) {
            // The finger is panning, not pressing: hand the gesture back to the browser.
            this.movedBeyondSlop = true;
            this.clearLongPressTimer();
        }

        return false;
    }

    /**
     * @returns true when the gesture produced a caret or selection, meaning the caller
     * should suppress the synthesized mouse events the browser emits after the tap.
     */
    pointerUp(event: TouchPointerInput): boolean {
        if (event.pointerType !== "touch") return false;
        if (this.pointerId === undefined || this.pointerId !== event.pointerId) return false;

        const wasSelecting = this.selecting;
        const wasTap = !wasSelecting && !this.movedBeyondSlop;

        this.reset();

        if (wasSelecting) {
            this.handlers.onSelectionEnd();
            return true;
        }
        if (wasTap) {
            this.handlers.onTap({ clientX: event.clientX, clientY: event.clientY });
            return true;
        }
        return false;
    }

    /** Aborts the gesture (pointercancel, a second finger, or unmount). */
    cancel(): void {
        const wasSelecting = this.selecting;
        this.reset();
        if (wasSelecting) {
            this.handlers.onSelectionEnd();
        }
    }

    /** Releases the pending timer; safe to call more than once. */
    destroy(): void {
        this.reset();
    }

    private reset(): void {
        this.clearLongPressTimer();
        this.pointerId = undefined;
        this.movedBeyondSlop = false;
        this.selecting = false;
    }

    private clearLongPressTimer(): void {
        if (this.longPressTimer !== undefined) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }
    }
}
