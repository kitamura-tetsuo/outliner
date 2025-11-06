import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import type { Item } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

// Mirrors e2e/new/als-alias-node-58ad30d4.spec.ts

// Interface for test data structure
interface TestItemData {
    id: string;
    text: string;
    items: TestItemData[];
    aliasTargetId?: string;
}

describe("ALS alias node", () => {
    it("assigns target when option clicked", async () => {
        const items: TestItemData[] = [
            { id: "1", text: "first", items: [] },
            { id: "2", text: "second", items: [] },
            { id: "alias", text: "alias", items: [] },
        ];
        generalStore.currentPage = { id: "root", text: "root", items } as unknown as Item;
        render(AliasPicker);

        const user = userEvent.setup();
        aliasPickerStore.show("alias");
        const option = await screen.findByRole("button", { name: "root/second" });
        await user.click(option);
        const pageItems = generalStore.currentPage?.items;
        const aliasItem = pageItems?.at(2);
        expect(aliasItem?.aliasTargetId).toBe("2");
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
