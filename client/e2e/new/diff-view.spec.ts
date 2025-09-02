// @ts-nocheck
/** @feature HDV-0001
 *  Title   : Page snapshot diff viewer
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("snapshot diff viewer", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("display diff and revert", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.navigateToTestProjectPage(page, testInfo, []);

        await page.evaluate(
            ({ projectName, pageName }) => {
                window.__SNAPSHOT_SERVICE__.setCurrentContent(
                    projectName,
                    pageName,
                    "second",
                );

                window.__SNAPSHOT_SERVICE__.addSnapshot(
                    projectName,
                    pageName,
                    "first",
                    "user",
                );
            },
            { projectName, pageName },
        );

        await page.goto(`/${projectName}/${pageName}/diff`);

        await page.waitForTimeout(1000);

        // ページの状態をデバッグ
        const pageContent = await page.content();
        console.log("Page content length:", pageContent.length);

        const snapshotServiceExists = await page.evaluate(() => {
            return !!(window as any).__SNAPSHOT_SERVICE__;
        });
        console.log("Snapshot service exists:", snapshotServiceExists);

        // ページのパラメータを確認
        const pageParams = await page.evaluate(() => {
            return {
                url: window.location.href,

                pathname: window.location.pathname,

                params: (window as any).$page?.params,
            };
        });
        console.log("Page params:", pageParams);

        // SnapshotDiffModalコンポーネントが存在するかを確認
        const modalExists = await page.locator(".p-4.bg-white.rounded.shadow-lg").count();
        console.log("SnapshotDiffModal exists:", modalExists);

        const addSnapshotButton = await page.locator('text="Add Snapshot"').count();
        console.log("Add Snapshot button count:", addSnapshotButton);

        if (addSnapshotButton === 0) {
            const allButtons = await page.locator("button").allTextContents();

            console.log("All buttons on page:", allButtons);

            // ページの主要な要素を確認
            const mainContent = await page.locator("main, body > div").first().innerHTML();

            console.log("Main content (first 500 chars):", mainContent.substring(0, 500));
        }
        await page.getByText("Add Snapshot").click();

        await page.waitForSelector("li");

        const count = await page.evaluate(
            ({ projectName, pageName }) => {
                const { listSnapshots } = window.__SNAPSHOT_SERVICE__;

                return listSnapshots(projectName, pageName).length;
            },
            { projectName, pageName },
        );

        await expect(page.locator("li")).toHaveCount(count);

        await page.locator("li").first().click();

        await expect(page.locator("ins")).toBeVisible();

        await page.getByText("Revert").click();

        const current = await page.evaluate(
            ({ projectName, pageName }) => {
                const { getCurrentContent } = window.__SNAPSHOT_SERVICE__;

                return getCurrentContent(projectName, pageName);
            },
            { projectName, pageName },
        );
        expect(current).toBe("first");
    });
});
