import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Item } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

import { beforeEach } from "vitest";
beforeEach(() => aliasPickerStore.reset());

// Mirrors e2e/new/als-alias-path-navigation.spec.ts

describe("ALS alias path navigation", () => {
    it("enumerates nested item paths", async () => {
        // Create root item with proper Yjs tree structure
        generalStore.currentPage = new Item({ id: "root", text: "root" });
        render(AliasPicker);

        // Add parent item with a child
        if (generalStore.currentPage) {
            const parent = generalStore.currentPage.items.addNode("author", 0);
            parent.id = "p";
            parent.text = "parent";

            // Add child to parent
            const child = parent.items.addNode("author", 0);
            child.id = "c";
            child.text = "child";

            // Add alias item
            const aliasItem = generalStore.currentPage.items.addNode("author", 1);
            aliasItem.id = "alias";
            aliasItem.text = "alias";
        }

        aliasPickerStore.show("alias");
        const options = await screen.findAllByRole("button");
        const paths = options.map(o => o.textContent);
        expect(paths).toContain("root/parent");
        expect(paths).toContain("root/parent/child");
    });
});
