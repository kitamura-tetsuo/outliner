import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { beforeEach } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Item, Items } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
beforeEach(() => aliasPickerStore.reset());

// Mirrors e2e/new/als-alias-self-reference-test.spec.ts

describe("ALS alias self reference", () => {
    it("prevents selecting self", async () => {
        const items = [{ id: "alias", text: "alias", items: [] }];
        (generalStore as unknown as { currentPage: Item; }).currentPage = {
            id: "root",
            text: "root",
            items: items as unknown as Items,
        } as unknown as Item;
        render(AliasPicker);

        aliasPickerStore.show("alias");
        const option = screen.queryByRole("button", { name: "root/alias" });
        expect(option).toBeNull();
        aliasPickerStore.hide();
        expect((items[0] as unknown as { aliasTargetId?: string; }).aliasTargetId).toBeUndefined();
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
