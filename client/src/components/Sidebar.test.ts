import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { tick } from "svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar.svelte";

// Mock SvelteKit's navigation modules
vi.mock("$app/navigation", () => ({
    goto: vi.fn(),
}));

vi.mock("$app/paths", () => ({
    resolve: (path) => path,
}));

// Mock stores
const mockStore = writable({
    project: {
        title: "Test Project",
        items: [
            { id: "1", text: "Test Page 1", lastChanged: new Date("2024-01-01") },
            { id: "2", text: "Test Page 2", lastChanged: new Date("2024-01-02") },
        ],
    },
});

vi.mock("../../stores/store.svelte", () => ({
    store: mockStore,
}));

describe("Sidebar", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        mockStore.set({
            project: {
                title: "Test Project",
                items: [
                    { id: "1", text: "Test Page 1", lastChanged: new Date("2024-01-01") },
                    { id: "2", text: "Test Page 2", lastChanged: new Date("2024-01-02") },
                ],
            },
        });
    });

    it("should render the sidebar with default props", () => {
        render(Sidebar);
        expect(screen.getByText("Sidebar")).toBeInTheDocument();
        expect(screen.getByText("This is a placeholder sidebar component.")).toBeInTheDocument();
    });

    it("should render project and page sections", () => {
        render(Sidebar, { isOpen: true });
        expect(screen.getByRole("link", { name: "Go to projects page" })).toBeInTheDocument();
        expect(screen.getByText("Pages")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    });

    it('should display "No pages available" when there are no pages', () => {
        mockStore.set({
            project: {
                title: "Test Project",
                items: [],
            },
        });
        render(Sidebar, { isOpen: true });
        expect(screen.getByText("No pages available")).toBeInTheDocument();
    });

    it("should display a list of pages when available", () => {
        render(Sidebar, { isOpen: true });
        expect(screen.getByText("Test Page 1")).toBeInTheDocument();
        expect(screen.getByText("Test Page 2")).toBeInTheDocument();
    });

    it("should navigate to the correct page on page item click", async () => {
        const user = userEvent.setup();
        const { getByText } = render(Sidebar, { isOpen: true });
        const { goto } = await import("$app/navigation");

        const page1 = getByText("Test Page 1");
        await user.click(page1);
        await tick();

        expect(goto).toHaveBeenCalledWith("/Test%20Project/Test%20Page%201");
    });

    describe("Toggle functionality", () => {
        it("should show/hide page list when Pages section is toggled", async () => {
            const user = userEvent.setup();
            render(Sidebar, { isOpen: true });

            const pagesHeader = screen.getByLabelText("Toggle pages section");
            await user.click(pagesHeader);
            await tick();

            expect(screen.queryByText("Test Page 1")).not.toBeInTheDocument();

            await user.click(pagesHeader);
            await tick();

            expect(screen.getByText("Test Page 1")).toBeInTheDocument();
        });
    });

    it("should navigate to the settings page on settings link click", async () => {
        const user = userEvent.setup();
        render(Sidebar, { isOpen: true });
        const { goto } = await import("$app/navigation");

        const settingsLink = screen.getByRole("button", { name: "Settings" });
        await user.click(settingsLink);
        await tick();

        expect(goto).toHaveBeenCalledWith("/settings");
    });

    it("should render the new project links", () => {
        render(Sidebar, { isOpen: true });
        expect(screen.getByRole("link", { name: "Go to projects page" })).toHaveAttribute("href", "/projects");
        expect(screen.getByText("Shared with me")).toHaveAttribute("href", "/projects?filter=shared");
        expect(screen.getByText("Trash")).toHaveAttribute("href", "/projects/trash");
    });
});
