import { fireEvent, render, screen } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { queryStore } from "../services/sqlService";
import EditableQueryGrid from "./EditableQueryGrid.svelte";

// Mock the sqlService
vi.mock("../services/sqlService", () => {
    return {
        queryStore: writable({ rows: [], columnsMeta: [] }),
        applyEdit: vi.fn(),
    };
});

describe("EditableQueryGrid", () => {
    it("should render 'Please execute a query' when no data is present", () => {
        render(EditableQueryGrid);
        expect(screen.getByText("Please execute a query")).toBeInTheDocument();
    });

    it("should enter edit mode when Enter key is pressed on a cell", async () => {
        // Setup data
        queryStore.set({
            rows: [{ id: 1, name: "Test" }],
            columnsMeta: [{ name: "id" }, { name: "name" }],
        });

        render(EditableQueryGrid);

        // Find the cell containing "Test"
        const cellText = screen.getByText("Test");
        const cell = cellText.closest("td");
        expect(cell).toBeInTheDocument();

        if (cell) {
            // Focus the cell
            await fireEvent.focus(cell);

            // Press Enter
            await fireEvent.keyDown(cell, { key: "Enter" });

            // Check if input appears
            const input = screen.getByDisplayValue("Test");
            expect(input).toBeInTheDocument();
            expect(input.tagName).toBe("INPUT");
        }
    });
});
