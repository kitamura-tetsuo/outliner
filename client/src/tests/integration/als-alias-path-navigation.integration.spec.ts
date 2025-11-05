import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Item, Items } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

import { beforeEach } from "vitest";
beforeEach(() => aliasPickerStore.reset());

// Mirrors e2e/new/als-alias-path-navigation.spec.ts

describe("ALS alias path navigation", () => {
    it("enumerates nested item paths", async () => {
        const items = [
            { id: "p", text: "parent", items: [{ id: "c", text: "child", items: [] }] },
            { id: "alias", text: "alias", items: [] },
        ];
        (generalStore as unknown as { currentPage: Item; }).currentPage = {
            id: "root",
            text: "root",
            items: items as unknown as Items,
        } as unknown as Item;
        render(AliasPicker);

        aliasPickerStore.show("alias");
        const options = await screen.findAllByRole("button");
        const paths = options.map(o => o.textContent);
        expect(paths).toContain("root/parent");
        expect(paths).toContain("root/parent/child");
    });
});
