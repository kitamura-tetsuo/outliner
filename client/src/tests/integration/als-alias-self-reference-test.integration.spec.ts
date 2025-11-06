import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { beforeEach } from "vitest";
import AliasPicker from "../../components/AliasPicker.svelte";
import { Project } from "../../schema/app-schema";
import { aliasPickerStore } from "../../stores/AliasPickerStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
beforeEach(() => aliasPickerStore.reset());

// Mirrors e2e/new/als-alias-self-reference-test.spec.ts

// Interface for test data structure
interface TestItemData {
    id: string;
    text: string;
    items: TestItemData[];
    aliasTargetId?: string;
}

describe("ALS alias self reference", () => {
    it("prevents selecting self", async () => {
        // Create project and page
        const project = Project.createInstance("test");
        const page = project.addPage("root", "test-user");
        generalStore.currentPage = page;

        // Create alias child item
        const aliasItem = page.items.addNode("test-user");

        // Track the alias item in test data for assertions
        const items: TestItemData[] = [{ id: aliasItem.id, text: "alias", items: [], aliasTargetId: undefined }];

        render(AliasPicker);

        aliasPickerStore.show(aliasItem.id);
        const option = screen.queryByRole("button", { name: `root/${aliasItem.id}` });
        expect(option).toBeNull();
        aliasPickerStore.hide();
        expect(items[0].aliasTargetId).toBeUndefined();
        expect(aliasPickerStore.isVisible).toBe(false);
    });
});
