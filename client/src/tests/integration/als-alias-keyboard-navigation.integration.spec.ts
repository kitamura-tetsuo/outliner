import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Project } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

// Mirrors e2e/new/als-alias-keyboard-navigation.spec.ts

describe("ALS alias keyboard navigation", () => {
    it("navigates options with arrow keys and selects target", async () => {
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

        aliasPickerStore.show(aliasItem.id);
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
        const aliasItemActual = pageItems?.at(2);
        expect(aliasItemActual?.aliasTargetId).toBe(secondItem.id);
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
