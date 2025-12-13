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

        const user = userEvent.setup();
        aliasPickerStore.show(aliasItem.id);
        const option = await screen.findByRole("button", { name: "root/second" });
        await user.click(option);
        expect(aliasItem.aliasTargetId).toBe(second.id);
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
