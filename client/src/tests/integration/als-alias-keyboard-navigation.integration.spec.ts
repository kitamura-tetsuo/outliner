import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Item } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

// Mirrors e2e/new/als-alias-keyboard-navigation.spec.ts

describe("ALS alias keyboard navigation", () => {
    it("navigates options with arrow keys and selects target", async () => {
        // Create root item with proper Yjs tree structure
        generalStore.currentPage = new Item({ id: "root", text: "root" });
        render(AliasPicker);

        // Add items to the root item's children
        if (generalStore.currentPage) {
            // Add three items
            const item1 = generalStore.currentPage.items.addNode("author", 0);
            item1.id = "1";
            item1.text = "first";

            const item2 = generalStore.currentPage.items.addNode("author", 1);
            item2.id = "2";
            item2.text = "second";

            const aliasItem = generalStore.currentPage.items.addNode("author", 2);
            aliasItem.id = "alias";
            aliasItem.text = "alias";
        }

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
        const pageItems = generalStore.currentPage?.items;
        if (pageItems && pageItems.length >= 3) {
            const aliasChild = pageItems.at(2);
            if (aliasChild) {
                expect(aliasChild.aliasTargetId).toBeDefined();
            }
        }
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
