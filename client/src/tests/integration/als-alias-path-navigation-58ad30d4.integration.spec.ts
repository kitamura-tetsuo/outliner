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
        const project = Project.createInstance("Test Project");
        const rootPage = project.addPage("root", "tester");

        const parent = rootPage.items.addNode("tester");
        parent.updateText("parent");

        parent.items.addNode("tester").updateText("child");

        const aliasItem = rootPage.items.addNode("tester");
        aliasItem.updateText("alias");

        generalStore.project = project;
        generalStore.currentPage = rootPage;
        render(AliasPicker);

        aliasPickerStore.show(aliasItem.id);
        const options = await screen.findAllByRole("button");
        const paths = options.map(o => o.textContent);
        expect(paths).toContain("root/parent");
        expect(paths).toContain("root/parent/child");
    });
});
