import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../schema/app-schema";
import { store } from "../stores/store.svelte";
import Sidebar from "./Sidebar.svelte";

// Mock the stores
vi.mock("../stores/projectStore.svelte", () => {
    const mockProjectStore = {
        projects: [
            { id: "project-1", name: "Test Project 1", isDefault: true },
            { id: "project-2", name: "Test Project 2", isDefault: false },
        ],
        syncFromFirestore: vi.fn(),
        reset: vi.fn(),
    };
    return {
        projectStore: mockProjectStore,
    };
});

// Import the mocked projectStore for test manipulation
import { projectStore } from "../stores/projectStore.svelte";

vi.mock("../stores/store.svelte", () => {
    const mockProject = {
        title: "Test Project",
        items: {
            [Symbol.iterator]: function*() {
                yield {
                    id: "page-1",
                    text: "Test Page 1",
                    lastChanged: new Date("2024-01-01").getTime(),
                    items: { length: 0 },
                };
                yield {
                    id: "page-2",
                    text: "Test Page 2",
                    lastChanged: new Date("2024-01-02").getTime(),
                    items: { length: 0 },
                };
            },
            at: function(index: number) {
                const items = [
                    {
                        id: "page-1",
                        text: "Test Page 1",
                        lastChanged: new Date("2024-01-01").getTime(),
                        items: { length: 0 },
                    },
                    {
                        id: "page-2",
                        text: "Test Page 2",
                        lastChanged: new Date("2024-01-02").getTime(),
                        items: { length: 0 },
                    },
                ];
                return items[index];
            },
        },
    };
    return {
        store: {
            project: mockProject,
            pages: {
                current: [
                    {
                        id: "page-1",
                        text: "Test Page 1",
                        lastChanged: new Date("2024-01-01").getTime(),
                        items: { length: 0 },
                    },
                    {
                        id: "page-2",
                        text: "Test Page 2",
                        lastChanged: new Date("2024-01-02").getTime(),
                        items: { length: 0 },
                    },
                ],
            },
            currentPage: null,
            pagesVersion: 0,
        },
    };
});

// Mock $app/navigation
vi.mock("$app/navigation", () => {
    return {
        goto: vi.fn(),
    };
});

// Mock $app/stores
vi.mock("$app/stores", async () => {
    const { readable } = await import("svelte/store");
    return {
        page: readable({
            url: {
                pathname: "/Test%20Project/Test%20Page%201",
            },
        }),
    };
});

describe("Sidebar", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset store state
        store.project = {
            title: "Test Project",
        } as any;
        store.pages = {
            current: [
                {
                    id: "page-1",
                    text: "Test Page 1",
                    lastChanged: new Date("2024-01-01").getTime(),
                    items: { length: 0 },
                },
                {
                    id: "page-2",
                    text: "Test Page 2",
                    lastChanged: new Date("2024-01-02").getTime(),
                    items: { length: 0 },
                },
            ],
        } as any;
        store.pagesVersion = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Rendering", () => {
        it("should render the sidebar component", () => {
            render(Sidebar, { isOpen: true });

            expect(screen.getByText("Sidebar")).toBeInTheDocument();
            expect(screen.getByText("This is a placeholder sidebar component.")).toBeInTheDocument();
        });

        it("should render the sidebar with correct classes when open", () => {
            const { container } = render(Sidebar, { isOpen: true });

            const sidebarElement = container.querySelector("aside.sidebar");
            expect(sidebarElement).toHaveClass("open");
        });

        it("should render the sidebar with correct classes when closed", () => {
            const { container } = render(Sidebar, { isOpen: false });

            const sidebarElement = container.querySelector("aside.sidebar");
            expect(sidebarElement).not.toHaveClass("open");
        });

        it("should render the Projects section", () => {
            render(Sidebar, { isOpen: true });

            expect(screen.getByText("Projects")).toBeInTheDocument();
        });

        it("should render the Pages section", () => {
            render(Sidebar, { isOpen: true });

            expect(screen.getByText("Pages")).toBeInTheDocument();
        });

        it("should render the Settings link", () => {
            render(Sidebar, { isOpen: true });

            // Use getAllByText and check the settings-link div, not the section title
            const settingsLinks = screen.getAllByText("Settings");
            const settingsLinkDiv = settingsLinks.find(
                (el) => el.closest(".settings-link") !== null,
            );
            expect(settingsLinkDiv).toBeInTheDocument();
        });

        it("should render project items when containers exist", () => {
            render(Sidebar, { isOpen: true });

            expect(screen.getByText("Test Project 1")).toBeInTheDocument();
            expect(screen.getByText("Test Project 2")).toBeInTheDocument();
        });

        it("should render 'No projects available' when no projects", () => {
            // Temporarily override the mock
            const originalProjects = projectStore.projects;
            projectStore.projects = [];

            const { rerender } = render(Sidebar, { isOpen: true });

            expect(screen.getByText("No projects available")).toBeInTheDocument();

            // Restore
            projectStore.projects = originalProjects;
            rerender({ isOpen: true });
        });

        it("should render page items when project has pages", () => {
            render(Sidebar, { isOpen: true });

            expect(screen.getByText("Test Page 1")).toBeInTheDocument();
            expect(screen.getByText("Test Page 2")).toBeInTheDocument();
        });

        it("should render 'No pages available' when project has no items", () => {
            // Temporarily override the mock
            const originalProject = store.project;
            const originalPages = store.pages;

            store.project = Project.createInstance("Empty Project") as any;
            store.pages = { current: [] } as any;

            const { rerender } = render(Sidebar, { isOpen: true });

            expect(screen.getByText("No pages available")).toBeInTheDocument();

            // Restore
            if (originalProject) {
                store.project = originalProject;
            }
            if (originalPages) {
                store.pages = originalPages;
            }
            rerender({ isOpen: true });
        });

        it("should render default badge for default project", () => {
            render(Sidebar, { isOpen: true });

            expect(screen.getByText("Default")).toBeInTheDocument();
        });
    });

    describe("Toggle functionality", () => {
        it("should toggle Projects section collapse state", async () => {
            const user = userEvent.setup();
            render(Sidebar, { isOpen: true });

            const projectsHeader = screen.getByLabelText("Toggle projects section");
            await user.click(projectsHeader);

            expect(projectsHeader).toHaveAttribute("aria-expanded", "false");
        });

        it("should toggle Pages section collapse state", async () => {
            const user = userEvent.setup();
            render(Sidebar, { isOpen: true });

            const pagesHeader = screen.getByLabelText("Toggle pages section");
            await user.click(pagesHeader);

            expect(pagesHeader).toHaveAttribute("aria-expanded", "false");
        });

        it("should show/hide project list when Projects section is toggled", async () => {
            const user = userEvent.setup();
            render(Sidebar, { isOpen: true });

            const projectsHeader = screen.getByLabelText("Toggle projects section");
            const testProject1 = screen.getByText("Test Project 1");

            // Initially visible
            expect(testProject1).toBeVisible();

            // Collapse
            await user.click(projectsHeader);
            expect(projectsHeader).toHaveAttribute("aria-expanded", "false");
            // Project list is removed from DOM when collapsed

            // Expand again
            await user.click(projectsHeader);
            expect(projectsHeader).toHaveAttribute("aria-expanded", "true");
            // Re-query after expanding
            const testProject1Again = screen.getByText("Test Project 1");
            expect(testProject1Again).toBeVisible();
        });

        it("should show/hide page list when Pages section is toggled", async () => {
            const user = userEvent.setup();
            render(Sidebar, { isOpen: true });

            const pagesHeader = screen.getByLabelText("Toggle pages section");
            const testPage1 = screen.getByText("Test Page 1");

            // Initially visible
            expect(testPage1).toBeVisible();

            // Collapse
            await user.click(pagesHeader);
            expect(pagesHeader).toHaveAttribute("aria-expanded", "false");
            // Page list is removed from DOM when collapsed

            // Expand again
            await user.click(pagesHeader);
            expect(pagesHeader).toHaveAttribute("aria-expanded", "true");
            // Re-query after expanding
            const testPage1Again = screen.getByText("Test Page 1");
            expect(testPage1Again).toBeVisible();
        });
    });

    describe("Navigation", () => {
        it("should have correct href for page items", () => {
            render(Sidebar, { isOpen: true });

            const pageItem = screen.getByText("Test Page 1").closest("a");
            expect(pageItem).toBeInTheDocument();
            // Assuming resolve returns the path directly in test env (standard SvelteKit mock behavior or actual implementation)
            expect(pageItem).toHaveAttribute("href", "/Test%20Project/Test%20Page%201");
        });

        it("should have correct href for settings link", () => {
            render(Sidebar, { isOpen: true });

            // Get all settings elements and find the one in settings-link
            const settingsElements = screen.getAllByText("Settings");
            const settingsLink = settingsElements.find(
                (el) => el.closest(".settings-link") !== null,
            )?.closest("a");

            expect(settingsLink).toBeInTheDocument();
            expect(settingsLink).toHaveAttribute("href", "/settings");
        });
    });
});
