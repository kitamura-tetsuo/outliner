import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ChartQueryEditor from "./ChartQueryEditor.svelte";
import type { Item } from "../schema/app-schema";

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
