/** @feature CHT-001
 *  Title   : Chart Component
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CHT-001: Chart auto-refresh", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Graph appears and refreshes when data updates", async ({ page }) => {
        await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Chart Test</title>
        <script src="https://cdn.jsdelivr.net/npm/echarts@5.3.3/dist/echarts.min.js"></script>
      </head>
      <body>
        <div id="chart" style="width:400px;height:300px;"></div>
        <script>
          window.chartData = [120, 200, 150];
          const chart = echarts.init(document.getElementById('chart'));
          const option = { xAxis: {}, yAxis: {}, series: [{ type:'bar', data: window.chartData }] };
          chart.setOption(option);
          setTimeout(() => {
            window.chartData = [220, 300, 250];
            option.series[0].data = window.chartData;
            chart.setOption(option);
          }, 1000);
        </script>
      </body>
      </html>
    `);

        const chart = page.locator("#chart");
        await expect(chart).toBeVisible();

        const initial = await page.evaluate(() => (window as any).chartData);
        expect(initial).toEqual([120, 200, 150]);

        await page.waitForFunction(() => (window as any).chartData[0] === 220);
        const updated = await page.evaluate(() => (window as any).chartData);
        expect(updated).toEqual([220, 300, 250]);
    });
});
