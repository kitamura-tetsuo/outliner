import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";

// Minimal reactivity check for `{#if aliasPickerStore.isVisible}`
describe("ALS visibility reactivity", () => {
    it("shows and hides dialog when store visibility toggles", async () => {
        render(AliasPicker);

        // Initially hidden
        expect(screen.queryByRole("dialog")).toBeNull();

        // Show via store
        aliasPickerStore.show("dummy");
        const dialog = await screen.findByRole("dialog");
        expect(dialog).not.toBeNull();

        // Hide via store
        aliasPickerStore.hide();
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).toBeNull();
        });
    });
});
