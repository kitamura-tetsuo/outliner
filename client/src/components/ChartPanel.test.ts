import { render } from "@testing-library/svelte";
import * as echarts from "echarts";
import { describe, expect, it, vi } from "vitest";
import { Item } from "../schema/app-schema";
import * as sqlService from "../services/sqlService";
import ChartPanel from "./ChartPanel.svelte";

vi.mock("echarts", () => ({
    init: vi.fn(() => ({
        setOption: vi.fn(),
        dispose: vi.fn(),
        clear: vi.fn(),
    })),
}));

vi.mock("../services/sqlService", () => {
    return {
        initDb: vi.fn().mockResolvedValue(true),
        runQuery: vi.fn(),
        dbChangeStore: {
            subscribe: vi.fn(() => () => {}),
        },
    };
});

describe("ChartPanel", () => {
    it("should correctly partition label and numeric columns in setOption", async () => {
        const mockSetOption = vi.fn();
        vi.mocked(echarts.init).mockReturnValue({
            setOption: mockSetOption,
            dispose: vi.fn(),
            clear: vi.fn(),
        } as any);

        const mockResult = {
            columnsMeta: [
                { name: "sales_month" },
                { name: "sales_revenue" },
            ],
            rows: [
                { sales_month: "Jan", sales_revenue: 120 },
                { sales_month: "Feb", sales_revenue: 180 },
                { sales_month: "Mar", sales_revenue: 150 },
                { sales_month: "Apr", sales_revenue: 210 },
            ],
        };

        vi.mocked(sqlService.runQuery).mockReturnValue(mockResult as any);

        const item = new Item({ text: "chart" });
        item.chartQuery = "SELECT month AS sales_month, revenue AS sales_revenue FROM sales";

        render(ChartPanel, { item });

        // Wait for the async component logic
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockSetOption).toHaveBeenCalled();
        // Since the effect and onMount both might run it, let's take the latest call
        const option = mockSetOption.mock.calls[mockSetOption.mock.calls.length - 1][0];

        expect(option.xAxis.data).toEqual(["Jan", "Feb", "Mar", "Apr"]);
        expect(option.series).toHaveLength(1);
        expect(option.series[0]).toEqual({
            name: "sales_revenue",
            type: "bar",
            data: [120, 180, 150, 210],
        });
    });
});
