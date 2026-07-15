import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import OutlinerItemAlias from "../../components/OutlinerItemAlias.svelte";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";

describe("ALS alias live update", () => {
    it("updates path label live when target item text changes", async () => {
        const project = Project.createInstance("Test Project");
        const rootPage = project.addPage("root", "tester");

        const targetItem = rootPage.items.addNode("tester");
        targetItem.updateText("original text");

        const aliasItem = rootPage.items.addNode("tester");
        aliasItem.updateText("alias");
        aliasItem.aliasTargetId = targetItem.id;

        generalStore.project = project;
        generalStore.currentPage = rootPage;

        render(OutlinerItemAlias, { props: { modelId: aliasItem.id, item: aliasItem } });

        // Wait for it to render
        await waitFor(() => {
            expect(screen.getByText("original text")).toBeInTheDocument();
        });

        // Update text
        targetItem.updateText("changed text");

        // Wait for live update
        await waitFor(() => {
            expect(screen.queryByText("original text")).not.toBeInTheDocument();
            expect(screen.getByText("changed text")).toBeInTheDocument();
        });
    });
});
