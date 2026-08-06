import { fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalTextArea from "./GlobalTextArea.svelte";

describe("GlobalTextArea", () => {
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
});
