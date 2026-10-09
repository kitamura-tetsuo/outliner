import { fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import GlobalTextArea from "./GlobalTextArea.svelte";

describe("GlobalTextArea", () => {
    it("should call syncSelectionFromTextarea on selectionchange event", async () => {
        const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
            cb(0);
            return 1;
        });

        render(GlobalTextArea);
        vi.spyOn(store, "syncSelectionFromTextarea");

        const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
        textarea.focus();

        document.dispatchEvent(new Event("selectionchange"));

        expect(store.syncSelectionFromTextarea).toHaveBeenCalled();

        rafSpy.mockRestore();
    });

    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it("does not restore focus if blur relatedTarget is inside component-wrapper", async () => {
        const { container } = render(GlobalTextArea);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const focusSpy = vi.spyOn(textarea, "focus");

        const mockRelatedTarget = document.createElement("div");
        mockRelatedTarget.classList.add("component-wrapper");
        document.body.appendChild(mockRelatedTarget); // Need it in DOM

        await fireEvent.blur(textarea, { relatedTarget: mockRelatedTarget });

        // Wait for setTimeout in handleBlur
        vi.advanceTimersByTime(20);

        expect(focusSpy).not.toHaveBeenCalled();

        document.body.removeChild(mockRelatedTarget);
    });

    it("has the correct IME attributes to disable mobile autocorrect/autocapitalize", () => {
        const { container } = render(GlobalTextArea);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

        expect(textarea.getAttribute("autocapitalize")).toBe("off");
        expect(textarea.getAttribute("autocorrect")).toBe("off");
        expect(textarea.getAttribute("autocomplete")).toBe("off");
        expect(textarea.getAttribute("spellcheck")).toBe("false");
        expect(textarea.getAttribute("enterkeyhint")).toBe("enter");
        expect(textarea.getAttribute("inputmode")).toBe("text");
    });

    it("keeps wrap=off from the initial render through composition (#5501)", async () => {
        const { container } = render(GlobalTextArea);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(textarea.getAttribute("wrap")).toBe("off");

        textarea.focus();
        await fireEvent.compositionStart(textarea, { data: "" });
        expect(textarea.getAttribute("wrap")).toBe("off");
        await fireEvent.compositionUpdate(textarea, { data: "にほん" });
        expect(textarea.getAttribute("wrap")).toBe("off");
        await fireEvent.compositionEnd(textarea, { data: "日本" });
        expect(textarea.getAttribute("wrap")).toBe("off");
    });

    it("suppresses reading back the post-commit selectionchange after compositionend (#5501)", async () => {
        const { container } = render(GlobalTextArea);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const syncSpy = vi.spyOn(store, "syncSelectionFromTextarea");
        textarea.focus();

        await fireEvent.compositionStart(textarea, { data: "" });
        await fireEvent.compositionEnd(textarea, { data: "" });
        expect(store.isComposing).toBe(false);
        expect(store.suppressSelectionResync).toBe(true);

        document.dispatchEvent(new Event("selectionchange"));
        vi.runOnlyPendingTimers();
        expect(syncSpy).not.toHaveBeenCalled();
        expect(store.suppressSelectionResync).toBe(false);
        syncSpy.mockRestore();
    });
});
