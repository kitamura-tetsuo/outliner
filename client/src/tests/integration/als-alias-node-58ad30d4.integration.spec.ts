import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

// Mirrors e2e/new/als-alias-node-58ad30d4.spec.ts

describe("ALS alias node", () => {
    it("assigns target when option clicked", async () => {
        const items = [
            { id: "1", text: "first", items: [] },
            { id: "2", text: "second", items: [] },
            { id: "alias", text: "alias", items: [] },
        ];
        generalStore.currentPage = { id: "root", text: "root", items } as any;
        render(AliasPicker);

        const user = userEvent.setup();
        aliasPickerStore.show("alias");
        const option = await screen.findByRole("button", { name: "root/second" });
        await user.click(option);
        const pageItems = (generalStore.currentPage as any).items;
        expect(pageItems[2].aliasTargetId).toBe("2");
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
