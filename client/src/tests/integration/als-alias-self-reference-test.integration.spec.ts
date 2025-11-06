import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { beforeEach } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Item } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
beforeEach(() => aliasPickerStore.reset());

// Mirrors e2e/new/als-alias-self-reference-test.spec.ts

describe("ALS alias self reference", () => {
    it("prevents selecting self", async () => {
        // Create root item with proper Yjs tree structure
        generalStore.currentPage = new Item({ id: "root", text: "root" });
        render(AliasPicker);

        // Add alias item
        if (generalStore.currentPage) {
            const aliasItem = generalStore.currentPage.items.addNode("author", 0);
            aliasItem.id = "alias";
            aliasItem.text = "alias";
        }

        aliasPickerStore.show("alias");
        const option = screen.queryByRole("button", { name: "root/alias" });
        expect(option).toBeNull();
        aliasPickerStore.hide();
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
