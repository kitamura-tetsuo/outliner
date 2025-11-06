import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Project } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

// Mirrors e2e/new/als-alias-node-58ad30d4.spec.ts

describe("ALS alias node", () => {
    it("assigns target when option clicked", async () => {
        // Create project and page
        const project = Project.createInstance("test");
        const page = project.addPage("root", "test-user");
        generalStore.project = project;
        generalStore.currentPage = page;

        // Create child items
        const firstItem = page.items.addNode("test-user");
        firstItem.updateText("first");
        const secondItem = page.items.addNode("test-user");
        secondItem.updateText("second");
        const aliasItem = page.items.addNode("test-user");
        aliasItem.updateText("alias");

        render(AliasPicker);

        const user = userEvent.setup();
        aliasPickerStore.show(aliasItem.id);
        const option = await screen.findByRole("button", { name: "root/second" });
        await user.click(option);
        const pageItems = generalStore.currentPage?.items;
        const aliasItemActual = pageItems?.at(2);
        expect(aliasItemActual?.aliasTargetId).toBe(secondItem.id);
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
