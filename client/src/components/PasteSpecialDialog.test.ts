import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import PasteSpecialDialog from "./PasteSpecialDialog.svelte";

const choices = [
    {
        variant: "another-view" as const,
        label: "Another view",
        description: "Share component data.",
        available: false,
        reason: "The source component belongs to another project",
        isDefault: false,
    },
    {
        variant: "copy-with-data" as const,
        label: "Independent copy with data",
        description: "Copy component data once.",
        available: true,
        isDefault: true,
    },
];

describe("PasteSpecialDialog", () => {
    it("keeps an unavailable choice visible with its reason and focuses the first available choice", async () => {
        const { getByTestId } = render(PasteSpecialDialog, { choices, onchoose: vi.fn() });
        const unavailable = getByTestId("paste-special-another-view") as HTMLButtonElement;
        const available = getByTestId("paste-special-copy-with-data") as HTMLButtonElement;

        expect(unavailable.disabled).toBe(true);
        expect(unavailable.textContent).toContain("The source component belongs to another project");
        expect(available).toHaveFocus();
    });

    it("returns the chosen variant", async () => {
        const onchoose = vi.fn();
        const { getByTestId } = render(PasteSpecialDialog, { choices, onchoose });

        await fireEvent.click(getByTestId("paste-special-copy-with-data"));

        expect(onchoose).toHaveBeenCalledWith("copy-with-data");
    });

    it("cancels on Escape", async () => {
        const onchoose = vi.fn();
        const { getByTestId } = render(PasteSpecialDialog, { choices, onchoose });

        await fireEvent.keyDown(getByTestId("paste-special-dialog"), { key: "Escape" });

        expect(onchoose).toHaveBeenCalledWith(undefined);
    });
});
