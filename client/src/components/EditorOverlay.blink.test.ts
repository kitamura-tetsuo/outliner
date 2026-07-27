/**
 * @vitest-environment jsdom
 *
 * The caret blink is CSS driven: the component only has to (1) mark the caret
 * `.cursor.active`, (2) expose the `.paused` suppression hook on the overlay and
 * (3) remount the caret whenever the blink epoch changes so the animation
 * restarts from its "on" phase.
 *
 * The real store is used on purpose (no mock): it is a Svelte 5 `$state` class
 * and the epoch/paused reactivity is exactly what is under test.
 */
import { render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import EditorOverlay from "./EditorOverlay.svelte";

vi.mock("../stores/PresenceStore.svelte", () => ({
    presenceStore: {
        users: {},
    },
}));

vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: {
        isVisible: false,
    },
}));

function showLocalCursor() {
    editorOverlayStore.cursors = {
        "cursor-1": {
            cursorId: "cursor-1",
            itemId: "item-1",
            offset: 0,
            isActive: true,
            userId: "local",
        },
    };
    // setActiveItem notifies subscribers, which is what syncs the overlay's cursor list
    editorOverlayStore.setActiveItem("item-1");
}

async function findCaret(container: HTMLElement): Promise<HTMLElement> {
    return await waitFor(() => {
        const caret = container.querySelector<HTMLElement>(".cursor.active");
        expect(caret).not.toBeNull();
        return caret as HTMLElement;
    });
}

describe("EditorOverlay caret blink", () => {
    beforeEach(() => {
        editorOverlayStore.reset();
    });

    afterEach(() => {
        editorOverlayStore.reset();
    });

    it("renders an active caret without any test-environment override class", async () => {
        const { container } = render(EditorOverlay);
        showLocalCursor();

        const caret = await findCaret(container);
        expect(caret.classList.contains("test-env-visible")).toBe(false);
        expect(container.querySelector(".editor-overlay")?.hasAttribute("data-test-env")).toBe(false);
    });

    it("remounts the caret when the blink epoch changes so the animation restarts", async () => {
        const { container } = render(EditorOverlay);
        showLocalCursor();

        const caretBefore = await findCaret(container);

        editorOverlayStore.startCursorBlink();
        await tick();

        const caretAfter = container.querySelector<HTMLElement>(".cursor.active");
        expect(caretAfter).not.toBeNull();
        expect(caretAfter).not.toBe(caretBefore);
    });

    it("marks the overlay as paused while blinking is stopped", async () => {
        const { container } = render(EditorOverlay);
        showLocalCursor();
        await findCaret(container);

        const overlay = container.querySelector(".editor-overlay") as HTMLElement;
        expect(overlay.classList.contains("paused")).toBe(false);

        editorOverlayStore.stopCursorBlink();
        await tick();
        expect(overlay.classList.contains("paused")).toBe(true);

        editorOverlayStore.startCursorBlink();
        await tick();
        expect(overlay.classList.contains("paused")).toBe(false);
    });
});
