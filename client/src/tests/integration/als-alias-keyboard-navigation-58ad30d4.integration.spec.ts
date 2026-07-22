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
        const project = Project.createInstance("Test Project");
        const rootPage = project.addPage("root", "tester");

        rootPage.items.addNode("tester").updateText("first");

        const second = rootPage.items.addNode("tester");
        second.updateText("second");

        const aliasItem = rootPage.items.addNode("tester");
        aliasItem.updateText("alias");

        generalStore.project = project;
        generalStore.currentPage = rootPage;
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
        const updatedAliasItem = generalStore.currentPage?.items.at(2);
        expect(updatedAliasItem?.aliasTargetId).toBe(second.id);
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
