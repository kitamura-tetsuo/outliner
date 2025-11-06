import { render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import OutlinerTree from "../../components/OutlinerTree.svelte";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";

// jsdom lacks ResizeObserver; minimal stub
class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver; }).ResizeObserver = ResizeObserver;

describe("ATT: attachments UI rerenders on Yjs updates (integration)", () => {
    it("renders an attachment preview when Item.addAttachment is called", async () => {
        const project = Project.createInstance("test");
        const page = project.addPage("page", "me");
        const item = page.items.addNode("me");
        item.updateText("item with attachment");

        // Provide globals expected by components
        generalStore.project = project;
        generalStore.currentPage = page;

        const { container } = render(OutlinerTree, { pageItem: page, projectName: "test", pageName: "page" });

        const ONEPX_PNG =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAukB9pG0Jb8AAAAASUVORK5CYII=";

        // Pre-condition: no preview images
        const sel = `[data-item-id="${item.id}"]`;
        expect(container.querySelectorAll(`${sel} .attachments img`).length).toBe(0);

        // Act: add attachment via Yjs-backed API
        item.addAttachment(ONEPX_PNG);

        // Assert: preview appears
        await waitFor(() => {
            expect(container.querySelectorAll(`${sel} .attachments img`).length).toBe(1);
        });
    });
});
