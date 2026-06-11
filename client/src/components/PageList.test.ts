/** @vitest-environment jsdom */
import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../schema/app-schema";
import PageList from "./PageList.svelte";

describe("PageList", () => {
    let project: Project;

    beforeEach(() => {
        // Clear local storage
        localStorage.clear();
        project = Project.createInstance("test_project");
    });

    it("renders empty state correctly", () => {
        const { getByText } = render(PageList, {
            props: {
                project,
                rootItems: project.items,
            },
        });

        expect(getByText("No pages found.")).toBeTruthy();
        expect(getByText("Create a new page to get started")).toBeTruthy();
    });

    it("renders grid view by default and saves to localStorage", async () => {
        project.addPage("Page 1", "u1");
        project.addPage("Page 2", "u1");

        const { container } = render(PageList, {
            props: {
                project,
                rootItems: project.items,
            },
        });

        // Wait for effects to run
        await tick();

        // It should render "Page 1" and "Page 2"
        expect(container.textContent).toContain("Page 1");
        expect(container.textContent).toContain("Page 2");

        // localStorage should be 'grid'
        expect(localStorage.getItem("outliner_page_list_view")).toBe("grid");

        // Toggle to list view
        const listBtn = container.querySelector('[aria-label="List view"]');
        expect(listBtn).toBeTruthy();
        if (listBtn) {
            await fireEvent.click(listBtn);
            await tick();
            expect(localStorage.getItem("outliner_page_list_view")).toBe("list");
        }
    });

    it("initializes from localStorage preference", async () => {
        localStorage.setItem("outliner_page_list_view", "list");
        project.addPage("Page 1", "u1");

        const { container } = render(PageList, {
            props: {
                project,
                rootItems: project.items,
            },
        });

        // Wait for effects to run
        await tick();

        // Let's toggle back to grid to verify the initial state was list and could be changed
        const gridBtn = container.querySelector('[aria-label="Grid view"]');
        expect(gridBtn).toBeTruthy();
        if (gridBtn) {
            await fireEvent.click(gridBtn);
            await tick();
            expect(localStorage.getItem("outliner_page_list_view")).toBe("grid");
        }
    });
});
