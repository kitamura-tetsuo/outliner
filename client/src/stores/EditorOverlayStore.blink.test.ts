/**
 * @vitest-environment jsdom
 *
 * Blink contract of the real EditorOverlayStore (not the test double used in
 * EditorOverlayStore.test.ts): blinking is expressed as a phase epoch plus a
 * pause flag, and no timer is left behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorOverlayStore } from "./EditorOverlayStore.svelte";

describe("EditorOverlayStore cursor blink", () => {
    beforeEach(() => {
        editorOverlayStore.reset();
    });

    afterEach(() => {
        vi.useRealTimers();
        editorOverlayStore.reset();
    });

    it("resets to a clean blink state", () => {
        expect(editorOverlayStore.cursorBlinkEpoch).toBe(0);
        expect(editorOverlayStore.animationPaused).toBe(false);
    });

    it("bumps the epoch on every start so the CSS animation restarts", () => {
        editorOverlayStore.startCursorBlink();
        expect(editorOverlayStore.cursorBlinkEpoch).toBe(1);

        editorOverlayStore.startCursorBlink();
        expect(editorOverlayStore.cursorBlinkEpoch).toBe(2);
    });

    it("pauses on stop and resumes on start", () => {
        editorOverlayStore.stopCursorBlink();
        expect(editorOverlayStore.animationPaused).toBe(true);

        editorOverlayStore.startCursorBlink();
        expect(editorOverlayStore.animationPaused).toBe(false);
    });

    it("leaves no timer behind", () => {
        vi.useFakeTimers();
        editorOverlayStore.startCursorBlink();
        const epochAfterStart = editorOverlayStore.cursorBlinkEpoch;

        vi.advanceTimersByTime(5000);

        expect(vi.getTimerCount()).toBe(0);
        expect(editorOverlayStore.cursorBlinkEpoch).toBe(epochAfterStart);
    });

    it("notifies subscribers when the blink state changes", () => {
        const listener = vi.fn();
        const unsubscribe = editorOverlayStore.subscribe(listener);
        listener.mockClear();

        editorOverlayStore.startCursorBlink();
        expect(listener).toHaveBeenCalled();

        listener.mockClear();
        editorOverlayStore.stopCursorBlink();
        expect(listener).toHaveBeenCalled();

        unsubscribe();
    });
});
