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

    it("has correct accessibility attributes", async () => {
        const { getByPlaceholderText, getByRole, getAllByRole } = render(SearchBox);
        const input = getByPlaceholderText("Search pages");

        // Initial state
        expect(input.getAttribute("role")).toBe("combobox");
        expect(input.getAttribute("aria-expanded")).toBe("false");
        expect(input.getAttribute("aria-autocomplete")).toBe("list");

        // Type to show results
        await fireEvent.input(input, { target: { value: "Page" } });
        await fireEvent.focus(input);

        // Check listbox
        const listbox = getByRole("listbox");
        expect(listbox).toBeTruthy();
        expect(input.getAttribute("aria-controls")).toBe("search-results-listbox");
        expect(listbox.id).toBe("search-results-listbox");

        // Check options
        const options = getAllByRole("option");
        expect(options.length).toBe(2);
        expect(options[0].getAttribute("aria-selected")).toBe("true"); // First item selected by default
        expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);

        // Navigate down
        await fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(options[0].getAttribute("aria-selected")).toBe("false");
        expect(options[1].getAttribute("aria-selected")).toBe("true");
        expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    });
});
