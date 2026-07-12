import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import ChartPanel from '../../src/components/ChartPanel.svelte';
import * as sqlService from '../../src/services/sqlService';
import * as echarts from 'echarts';
import type { Item } from '../../src/schema/app-schema';

vi.mock('../../src/services/sqlService', () => ({
    initDb: vi.fn().mockResolvedValue(undefined),
    runQuery: vi.fn(),
    dbChangeStore: {
        subscribe: vi.fn().mockReturnValue(vi.fn())
    }
}));

vi.mock('echarts', () => ({
    init: vi.fn().mockReturnValue({
        setOption: vi.fn(),
        dispose: vi.fn(),
        clear: vi.fn(),
    })
}));

describe('ChartPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should correctly partition columns into labels and series', async () => {
        const mockSetOption = vi.fn();
        vi.mocked(echarts.init).mockReturnValue({
            setOption: mockSetOption,
            dispose: vi.fn(),
            clear: vi.fn(),
        } as unknown as echarts.ECharts);

        const DEMO_CHART_QUERY =
            "DROP TABLE IF EXISTS sales; CREATE TABLE sales(id TEXT PRIMARY KEY, month TEXT, revenue INTEGER);"
            + ' INSERT INTO sales VALUES("1","Jan",120),("2","Feb",180),("3","Mar",150),("4","Apr",210);'
            + " SELECT month AS sales_month, revenue AS sales_revenue FROM sales";

        vi.mocked(sqlService.runQuery).mockReturnValue({
            columnsMeta: [{ name: 'sales_month' }, { name: 'sales_revenue' }],
            rows: [
                { sales_month: 'Jan', sales_revenue: 120 },
                { sales_month: 'Feb', sales_revenue: 180 },
                { sales_month: 'Mar', sales_revenue: 150 },
                { sales_month: 'Apr', sales_revenue: 210 },
            ]
        } as unknown as ReturnType<typeof sqlService.runQuery>);

        render(ChartPanel, { props: { item: { chartQuery: DEMO_CHART_QUERY } as unknown as Item } });

        await waitFor(() => {
            expect(mockSetOption).toHaveBeenCalled();
        });

        const callArgs = mockSetOption.mock.calls[0][0];

        // Assert xAxis data is correctly set from first non-numeric column
        expect(callArgs.xAxis.data).toEqual(['Jan', 'Feb', 'Mar', 'Apr']);

        // Assert series data is correctly filtered for numeric columns
        expect(callArgs.series).toHaveLength(1);
        expect(callArgs.series[0].name).toBe('sales_revenue');
        expect(callArgs.series[0].data).toEqual([120, 180, 150, 210]);
    });

    it('should fallback to row indices for xAxis if all columns are numeric', async () => {
        const mockSetOption = vi.fn();
        vi.mocked(echarts.init).mockReturnValue({
            setOption: mockSetOption,
            dispose: vi.fn(),
            clear: vi.fn(),
        } as unknown as echarts.ECharts);

        vi.mocked(sqlService.runQuery).mockReturnValue({
            columnsMeta: [{ name: 'col1' }, { name: 'col2' }],
            rows: [
                { col1: 10, col2: 20 },
                { col1: 30, col2: 40 },
            ]
        } as unknown as ReturnType<typeof sqlService.runQuery>);

        render(ChartPanel, { props: { item: { chartQuery: 'SELECT *' } as unknown as Item } });

        await waitFor(() => {
            expect(mockSetOption).toHaveBeenCalled();
        });

        const callArgs = mockSetOption.mock.calls[0][0];

        // Assert xAxis data falls back to indices
        expect(callArgs.xAxis.data).toEqual(['0', '1']);

        // Assert all numeric columns are included in series
        expect(callArgs.series).toHaveLength(2);
        expect(callArgs.series[0].name).toBe('col1');
        expect(callArgs.series[1].name).toBe('col2');
    });
});
