import { render, screen } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
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
});
