import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Item } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

// Mirrors e2e/new/als-alias-node-58ad30d4.spec.ts

describe("ALS alias node", () => {
    it("assigns target when option clicked", async () => {
        // Create root item with proper Yjs tree structure
        generalStore.currentPage = new Item({ id: "root", text: "root" });
        render(AliasPicker);

        // Add items to the root item's children
        if (generalStore.currentPage) {
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

        const user = userEvent.setup();
        aliasPickerStore.show("alias");
        const option = await screen.findByRole("button", { name: "root/second" });
        await user.click(option);
        const pageItems = generalStore.currentPage?.items;
        if (pageItems && pageItems.length >= 3) {
            const aliasChild = pageItems.at(2);
            if (aliasChild) {
                expect(aliasChild.aliasTargetId).toBe("2");
            }
        }
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
