import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { beforeEach } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Project } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
beforeEach(() => aliasPickerStore.reset());

// Mirrors e2e/new/als-alias-self-reference-test.spec.ts

describe("ALS alias self reference", () => {
    it("prevents selecting self", async () => {
        const project = Project.createInstance("Test Project");
        const rootPage = project.addPage("root", "tester");
        const aliasItem = rootPage.items.addNode("tester");
        aliasItem.updateText("alias");

        generalStore.project = project;
        generalStore.currentPage = rootPage;
        render(AliasPicker);

        aliasPickerStore.show(aliasItem.id);
        const option = screen.queryByRole("button", { name: "root/alias" });
        expect(option).toBeNull();
        aliasPickerStore.hide();
        expect(aliasItem.aliasTargetId).toBeUndefined();
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
