/** @vitest-environment jsdom */
import { goto } from "$app/navigation";
import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../schema/app-schema";
import PageList from "./PageList.svelte";

// Only the navigation boundary is replaced. `$app/paths` is deliberately NOT
// mocked: list hrefs and create-page destinations must come out of the real
// SvelteKit resolver through the migrated typed route IDs.
vi.mock("$app/navigation", () => ({
    goto: vi.fn(),
}));

describe("PageList", () => {
    let project: Project;

    beforeEach(() => {
        // Clear local storage
        localStorage.clear();
        project = Project.createInstance("test_project");
        vi.mocked(goto).mockClear();
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

    it("renders encoded hrefs for special-character page titles", async () => {
        project.addPage("設計メモ & plans", "u1");

        const { container } = render(PageList, {
            props: {
                project,
                rootItems: project.items,
            },
        });
        await tick();

        const link = container.querySelector("a[href]");
        expect(link?.getAttribute("href")).toBe(
            "/test_project/%E8%A8%AD%E8%A8%88%E3%83%A1%E3%83%A2%20%26%20plans",
        );
    });

    it("routes to the created page with a normal (non-replacing) navigation", async () => {
        const { getByLabelText } = render(PageList, {
            props: {
                project,
                rootItems: project.items,
            },
        });
        await tick();

        await fireEvent.input(getByLabelText("New page name"), { target: { value: "My New Page" } });
        await fireEvent.click(getByLabelText("Create new page"));
        await tick();

        expect(vi.mocked(goto)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(goto).mock.calls[0][0]).toBe("/test_project/My%20New%20Page");
        // A genuinely different page stacks history; only renames replace.
        expect(vi.mocked(goto).mock.calls[0].length).toBe(1);
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

        // Toggle back to grid to verify the initial state was list and could be changed
        const gridBtn = container.querySelector('[aria-label="Grid view"]');
        expect(gridBtn).toBeTruthy();
        if (gridBtn) {
            await fireEvent.click(gridBtn);
            await tick();
            expect(localStorage.getItem("outliner_page_list_view")).toBe("grid");
        }
    });
});
