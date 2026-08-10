import { render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableChartPanel from "./TableChartPanel.svelte";

vi.mock("echarts", () => ({
    init: vi.fn(() => ({
        setOption: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
    })),
}));

describe("TableChartPanel", () => {
    it("selects a non-technical column as the category label when available", () => {
        const result: TableQueryResult = {
            columns: ["id", "month", "revenue"],
            rows: [
                { id: "demo-1", month: "Jan", revenue: 120 },
                { id: "demo-2", month: "Feb", revenue: 180 },
            ],
        };
        const { getByTestId } = render(TableChartPanel, { initial: result });
        const chartDiv = getByTestId("yjs-table-chart");

        expect(chartDiv.getAttribute("aria-label")).toBe(
            "Bar chart of revenue by month: Jan (120), Feb (180)",
        );
    });

    it("falls back to technical column if no other textual column exists", () => {
        const result: TableQueryResult = {
            columns: ["id", "revenue"],
            rows: [
                { id: "demo-1", revenue: 120 },
                { id: "demo-2", revenue: 180 },
            ],
        };
        const { getByTestId } = render(TableChartPanel, { initial: result });
        const chartDiv = getByTestId("yjs-table-chart");

        expect(chartDiv.getAttribute("aria-label")).toBe(
            "Bar chart of revenue by id: demo-1 (120), demo-2 (180)",
        );
    });
});
