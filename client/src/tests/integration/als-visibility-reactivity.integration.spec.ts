import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import AliasPicker from "../../components/AliasPicker.svelte";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";

describe("ALS visibility reactivity", () => {
    beforeEach(() => {
        HTMLDialogElement.prototype.showModal = vi.fn();
        HTMLDialogElement.prototype.close = vi.fn();
    });
    it("shows and hides dialog when store visibility toggles", async () => {
        render(AliasPicker);

        // Initially hidden
        expect(aliasPickerStore.isVisible).toBe(false);

        // Show via store
        aliasPickerStore.show("dummy");
        expect(aliasPickerStore.isVisible).toBe(true);

        // Wait for Svelte reactivity
        await new Promise(resolve => setTimeout(resolve, 0));

        // The dialog is rendered when visible is true
        const dialog = document.querySelector(".alias-picker");
        expect(dialog).not.toBeNull();

        // Hide via store
        aliasPickerStore.hide();
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
