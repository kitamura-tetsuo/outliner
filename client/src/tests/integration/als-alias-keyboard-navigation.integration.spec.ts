import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import type { PlainItemData } from "../../types/yjs-types";

// Mirrors e2e/new/als-alias-keyboard-navigation.spec.ts

describe("ALS alias keyboard navigation", () => {
    it("navigates options with arrow keys and selects target", async () => {
        const items = [
            { id: "1", text: "first", items: [] },
            { id: "2", text: "second", items: [] },
            { id: "alias", text: "alias", items: [] },
        ];
        generalStore.currentPage = { id: "root", text: "root", items } as PlainItemData;
        render(AliasPicker);

        aliasPickerStore.show("alias");
        const picker = await screen.findByRole("dialog");
        picker.focus();
        const user = userEvent.setup();

        const options = await screen.findAllByRole("button");
        // Check if the parent element (li) has the 'selected' class
        expect(options[0].closest("li")?.classList.contains("selected")).toBe(true);

        await user.keyboard("{ArrowDown}");
        expect(options[1].closest("li")?.classList.contains("selected")).toBe(true);

        await user.keyboard("{ArrowUp}");
        expect(options[0].closest("li")?.classList.contains("selected")).toBe(true);

        await user.keyboard("{ArrowDown}");
        expect(options[1].closest("li")?.classList.contains("selected")).toBe(true);

        await user.keyboard("{Enter}");
        const pageItems =
            (generalStore.currentPage as PlainItemData & { items: Array<{ aliasTargetId?: string; }>; }).items;
        expect(pageItems[2].aliasTargetId).toBe("2");
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
