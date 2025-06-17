/** @feature TBL-0001
 * Editable JOIN Table
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0001: Editable JOIN Table", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // ページが完全に読み込まれるまで待機
        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ &&
                (window as any).__JOIN_TABLE__.fluid &&
                (window as any).__JOIN_TABLE__.store &&
                (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });
    });

    test("editable join table loads", async ({ page }) => {
        await expect(page).toHaveURL("/join-table");

        // 基本コンポーネントが表示されることを確認
        await expect(page.locator(".query-editor")).toBeVisible();
        await expect(page.locator('[data-testid="editable-grid"]')).toBeVisible();

        // チャートパネルの要素が存在することを確認
        const chartPanel = page.locator('[data-testid="chart-panel"]');
        await expect(chartPanel).toBeAttached();

        // チャートパネルのクラスが設定されていることを確認
        await expect(chartPanel).toHaveClass(/w-full h-64/);
    });

    test("initial data is loaded and displayed", async ({ page }) => {
        // wx-svelte-gridの初期化を待つ
        await page.waitForSelector('[data-testid="editable-grid"] .wx-grid', { timeout: 10000 });
        await page.waitForTimeout(2000); // グリッドの描画完了を待つ

        // wx-svelte-gridの実際のセル構造を確認（.wx-cellクラス使用）
        const cellInfo = await TestHelpers.getEditableGridCellInfo(page);

        console.log("Cell info:", cellInfo);
        expect(cellInfo).toBeDefined();
        expect(cellInfo?.cellCount).toBeGreaterThan(0);

        // 最初のデータセルが表示されることを確認
        const firstDataCell = page.locator('[data-testid="editable-grid"] .wx-cell[role="gridcell"]').first();
        await expect(firstDataCell).toBeVisible();
    });

    test("chart is rendered with initial data", async ({ page }) => {
        // チャートが描画されることを確認
        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.chartOption;
        }, { timeout: 5000 });

        const chartOption = await TestHelpers.getJoinTableChartOption(page);
        expect(chartOption).toBeDefined();
        expect(chartOption.xAxis).toBeDefined();
        expect(chartOption.yAxis).toBeDefined();
        expect(chartOption.series).toBeDefined();
    });
});
