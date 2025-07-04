/** @feature SCH-DF38D2F7
 *  Title   : Multi-Page Schedule Management
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Multi-Page Schedule Management", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("schedule operations across pages", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
        await TestHelpers.createTestPageViaAPI(page, "other-page", []);

        // open schedule for first page
        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();
        const input = page.locator('input[type="datetime-local"]');
        const firstTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);
        await input.fill(firstTime);
        await page.locator('button:has-text("Add")').click();
        await page.waitForTimeout(1000);
        const items = page.locator("ul li");
        await expect(items).toHaveCount(1);

        // edit schedule
        await items.first().locator('button:has-text("Edit")').click();
        const newTime = new Date(Date.now() + 120000).toISOString().slice(0, 16);
        await items.first().locator('input[type="datetime-local"]').fill(newTime);
        await page.locator('button:has-text("Save")').click();
        await page.waitForTimeout(1000);
        await expect(items).toHaveCount(1);

        await page.locator('button:has-text("Back")').click();

        const encodedProject = encodeURIComponent(projectName);
        await page.goto(`/${encodedProject}/other-page`);
        await page.locator("text=予約管理").click();
        await expect(page.locator("ul li")).toHaveCount(0);
        await page.locator('button:has-text("Back")').click();

        const encodedPage = encodeURIComponent(pageName);
        await page.goto(`/${encodedProject}/${encodedPage}`);
        await page.locator("text=予約管理").click();
        await items.first().locator('button:has-text("Cancel")').click();
        await expect(items).toHaveCount(0);
    });
});
