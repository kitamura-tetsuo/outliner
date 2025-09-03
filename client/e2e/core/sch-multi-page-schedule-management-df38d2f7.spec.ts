/** @feature SCH-DF38D2F7
 *  Title   : Multi-Page Schedule Management
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Multi-Page Schedule Management", () => {
    let testProject: { projectName: string; pageName: string; };

    test.beforeEach(async ({ page }, testInfo) => {
        testProject = await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Enable console logging
        page.on("console", msg => console.log("PAGE LOG:", msg.text()));
    });

    test("schedule operations across pages", async ({ page }, testInfo) => {
        const { projectName, pageName } = testProject;

        // Create another page in the same project using the correct method
        await page.evaluate(async () => {
            const store = window.generalStore;
            if (store && store.project) {
                // Use the addPage method to create a new page
                const newPage = store.project.addPage("other-page", "test-user");
                console.log("Created other-page in same project");
            }
        });

        // Wait for the page to be created
        await page.waitForTimeout(500);

        // open schedule for first page
        const firstPageId = await page.evaluate(() => {
            return window.generalStore?.currentPage?.id;
        });
        console.log("First page ID:", firstPageId);

        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();
        const input = page.locator('input[type="datetime-local"]');
        const firstTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);
        await input.fill(firstTime);
        await page.locator('button:has-text("Add")').click();
        await page.waitForTimeout(1000);
        const items = page.locator('[data-testid="schedule-item"]');
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

        // Wait for page to load and get current page ID
        await page.waitForTimeout(2000);
        const currentPageId = await page.evaluate(() => {
            return window.generalStore?.currentPage?.id;
        });
        console.log("Current page ID for other-page:", currentPageId);

        await page.locator("text=予約管理").click();
        await expect(page.locator('[data-testid="schedule-item"]')).toHaveCount(0);
        // Use force click to avoid interception issues
        await page.locator('button:has-text("Back")').click({ force: true });

        const encodedPage = encodeURIComponent(pageName);
        await page.goto(`/${encodedProject}/${encodedPage}`);
        await page.locator("text=予約管理").click();
        const finalItems = page.locator('[data-testid="schedule-item"]');
        await expect(finalItems).toHaveCount(1);
        await finalItems.first().locator('button:has-text("Cancel")').click();
        await expect(finalItems).toHaveCount(0);
    });
});
import "../utils/registerAfterEachSnapshot";
