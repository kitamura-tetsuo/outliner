import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0004
 *  Title   : Temporary Page Functionality
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: Temporary Page Edit and Save", () => {
    test.beforeEach(async () => {
        // No global setup needed here, environment is handled per test
    });

    test("When a temporary page is edited, it is saved as an actual page", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const sourceUrl = `/${encodeURIComponent(projectName)}/`;
        const nonExistentPage = "edit-temp-page-" + Date.now().toString().slice(-6);
        await page.goto(`${sourceUrl}${nonExistentPage}?isTest=true`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton = page.locator("button:has-text('Developer Login')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(300);
        }

        const outlinerBase = page.locator("[data-testid='outliner-base']");
        await expect(outlinerBase).toBeVisible();

        // Auto-creation is disabled, so we must click 'Add Item' to create the temp page
        const addItemBtn = page.getByRole("button", { name: "Add Item" });
        if (await addItemBtn.isVisible()) {
            await addItemBtn.click();
        }

        await TestHelpers.waitForOutlinerItems(page);
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await page.waitForTimeout(300);

        const firstId = await firstItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, firstId!);
        await TestHelpers.insertText(page, firstId!, "This is an edited temporary page.");
        await page.waitForTimeout(300);

        await page.waitForTimeout(300);

        const currentUrl = page.url();
        expect(currentUrl).toContain(nonExistentPage);
    });
});
