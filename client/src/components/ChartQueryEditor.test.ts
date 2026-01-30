import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../schema/app-schema";
import ChartQueryEditor from "./ChartQueryEditor.svelte";

// Mock the sqlService
vi.mock("../services/sqlService", () => ({
    initDb: vi.fn().mockResolvedValue(undefined),
    runQuery: vi.fn(),
}));

describe("ChartQueryEditor", () => {
    it("renders with correct placeholder", () => {
        const mockItem = {
            chartQuery: "",
        } as unknown as Item;

        render(ChartQueryEditor, { item: mockItem });
        expect(screen.getByPlaceholderText("Please enter SQL query")).toBeInTheDocument();
    });
});
