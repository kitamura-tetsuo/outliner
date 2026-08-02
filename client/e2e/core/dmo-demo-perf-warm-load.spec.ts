import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();
import { TestHelpers } from "../utils/testHelpers";

test("Demo warm load performance", async ({ page }, testInfo) => {
    test.setTimeout(90000); // Generous timeout for performance test

    // 1. Pre-seed demo
    await page.goto("/demo");
    await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 30000 });

    // 2. Measure multiple warm runs for demo
    const runs = 10;
    const demoTimes: number[] = [];

    for (let i = 0; i < runs; i++) {
        const start = Date.now();
        await page.goto("/demo");
        await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 15000 });
        demoTimes.push(Date.now() - start);
    }

    demoTimes.sort((a, b) => a - b);
    const demoMedian = demoTimes[Math.floor(runs / 2)];
    const demoP95 = demoTimes[Math.floor(runs * 0.95)];

    console.log(`Demo warm load - Median: ${demoMedian}ms, p95: ${demoP95}ms`);

    // 3. Normal project baseline
    // Create a new normal project first using TestHelpers instead of raw navigation
    const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Baseline2"]);
    const projectUrl = `/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`;

    const normalTimes: number[] = [];
    for (let i = 0; i < runs; i++) {
        const start = Date.now();
        await page.goto(projectUrl);
        await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 15000 });
        normalTimes.push(Date.now() - start);
    }

    normalTimes.sort((a, b) => a - b);
    const normalMedian = normalTimes[Math.floor(runs / 2)];
    const normalP95 = normalTimes[Math.floor(runs * 0.95)];

    console.log(`Normal project warm load - Median: ${normalMedian}ms, p95: ${normalP95}ms`);

    // 4. Assert criteria
    expect(demoMedian).toBeLessThanOrEqual(500); // Target criteria
    expect(demoMedian - normalMedian).toBeLessThanOrEqual(300); // No more than 300ms slower than baseline
});
