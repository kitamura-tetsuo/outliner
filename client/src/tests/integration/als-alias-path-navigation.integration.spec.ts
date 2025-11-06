import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Project } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

import { beforeEach } from "vitest";
beforeEach(() => aliasPickerStore.reset());

// Mirrors e2e/new/als-alias-path-navigation.spec.ts

describe("ALS alias path navigation", () => {
    it("enumerates nested item paths", async () => {
        // Create project and page
        const project = Project.createInstance("test");
        const page = project.addPage("root", "test-user");
        generalStore.project = project;
        generalStore.currentPage = page;

        // Create parent item with nested child
        const parentItem = page.items.addNode("test-user");
        parentItem.updateText("parent");
        const childItem = parentItem.items.addNode("test-user");
        childItem.updateText("child");

        // Create alias item
        const aliasItem = page.items.addNode("test-user");
        aliasItem.updateText("alias");

        render(AliasPicker);

        aliasPickerStore.show(aliasItem.id);
        const options = await screen.findAllByRole("button");
        const paths = options.map(o => o.textContent);
        expect(paths).toContain("root/parent");
        expect(paths).toContain("root/parent/child");
    });
});
