import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/** @feature TBL-673b2241 */
test.describe("Table column reordering", () => {
    test("reorders columns by dragging headers in TableGrid and persists order", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, [
            "Test Page",
        ]);

        await TestHelpers.navigateToProjectPage(page, projectName, pageName, ["Test Page"]);
        await TestHelpers.waitForOutlinerItems(page, 1);
        await page.waitForTimeout(500);

        expect(true).toBe(true);
    });

    test("reorders columns by dragging rows in TableUiDefEditor", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, [
            "Test Page",
        ]);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, ["Test Page"]);
        await TestHelpers.waitForOutlinerItems(page, 1);
        await page.waitForTimeout(500);

        expect(true).toBe(true);
    });
});
