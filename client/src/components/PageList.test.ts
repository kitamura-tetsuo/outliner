import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PageList from "./PageList.svelte";

// Mock the dependencies
const mockProject = {
    addPage: vi.fn(),
};

// Create a mock items array that mimics Y.Array/Items behavior
function createMockItems(items = []) {
    return items;
}

describe("PageList", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders empty state when no pages exist", () => {
        render(PageList, {
            project: mockProject,
            rootItems: createMockItems([]),
        });

        // Check for empty state message
        // Note: Actual text might change based on implementation details
        const emptyState = screen.getByText(/ページがありません/);
        expect(emptyState).toBeInTheDocument();
    });

    it("renders list of pages", () => {
        const mockPages = [
            { id: "1", text: "Page 1", lastChanged: Date.now() },
            { id: "2", text: "Page 2", lastChanged: Date.now() },
        ];

        render(PageList, {
            project: mockProject,
            rootItems: createMockItems(mockPages),
        });

        expect(screen.getByText("Page 1")).toBeInTheDocument();
        expect(screen.getByText("Page 2")).toBeInTheDocument();
        expect(screen.queryByText(/ページがありません/)).not.toBeInTheDocument();
    });

    it("calls project.addPage when create button is clicked", async () => {
        render(PageList, {
            project: mockProject,
            rootItems: createMockItems([]),
        });

        const input = screen.getByLabelText("新しいページ名");
        const createButton = screen.getByText("作成");

        await fireEvent.input(input, { target: { value: "My New Page" } });
        await fireEvent.click(createButton);

        expect(mockProject.addPage).toHaveBeenCalledWith("My New Page", "anonymous");
    });

    it("fires pageSelected event when a page is clicked", async () => {
        const mockPages = [
            { id: "1", text: "Page 1", lastChanged: Date.now() },
        ];
        const onPageSelected = vi.fn();

        const { component } = render(PageList, {
            project: mockProject,
            rootItems: createMockItems(mockPages),
            onPageSelected,
        });

        const pageButton = screen.getByText("Page 1").closest("button");
        await fireEvent.click(pageButton!);

        expect(onPageSelected).toHaveBeenCalled();
        const event = onPageSelected.mock.calls[0][0];
        expect(event.detail).toEqual({
            pageId: "1",
            pageName: "Page 1",
        });
    });
});
