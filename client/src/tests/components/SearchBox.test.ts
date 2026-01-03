import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import SearchBox from "../../components/SearchBox.svelte";

// Mock the store
vi.mock("../../stores/store.svelte", () => ({
    store: {
        project: {
            items: [
                { id: "1", text: "Page One", lastChanged: new Date() },
                { id: "2", text: "Page Two", lastChanged: new Date() },
            ],
            title: "Test Project",
        },
        pages: {
            current: [
                { id: "1", text: "Page One", lastChanged: new Date() },
                { id: "2", text: "Page Two", lastChanged: new Date() },
            ],
        },
    },
}));

// Mock navigation
vi.mock("$app/navigation", () => ({
    goto: vi.fn(),
}));

describe("SearchBox", () => {
    it("renders input", () => {
        const { getByPlaceholderText } = render(SearchBox);
        expect(getByPlaceholderText("Search pages")).toBeTruthy();
    });

    it("shows no results message when query matches nothing", async () => {
        const { getByPlaceholderText, findByText } = render(SearchBox);
        const input = getByPlaceholderText("Search pages");

        await fireEvent.input(input, { target: { value: "XYZ" } });

        // Expect to see "No results found"
        const noResults = await findByText("No results found").catch(() => null);
        expect(noResults).toBeTruthy();
    });

    it("shows clear button when query is present", async () => {
        const { getByPlaceholderText, getByRole } = render(SearchBox);
        const input = getByPlaceholderText("Search pages");

        await fireEvent.input(input, { target: { value: "Test" } });

        const clearButton = getByRole("button", { name: "Clear search" });
        expect(clearButton).toBeTruthy();
    });
});
