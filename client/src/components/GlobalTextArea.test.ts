import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import GlobalTextArea from "./GlobalTextArea.svelte";

describe("GlobalTextArea", () => {
    it("does not restore focus if blur relatedTarget is inside component-wrapper", async () => {
        const { container } = render(GlobalTextArea);
        const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
        const focusSpy = vi.spyOn(textarea, "focus");

        const mockRelatedTarget = document.createElement("div");
        mockRelatedTarget.classList.add("component-wrapper");
        document.body.appendChild(mockRelatedTarget); // Need it in DOM

        await fireEvent.blur(textarea, { relatedTarget: mockRelatedTarget });

        // Wait for setTimeout in handleBlur
        await new Promise(r => setTimeout(r, 20));

        expect(focusSpy).not.toHaveBeenCalled();

        document.body.removeChild(mockRelatedTarget);
    });
});
