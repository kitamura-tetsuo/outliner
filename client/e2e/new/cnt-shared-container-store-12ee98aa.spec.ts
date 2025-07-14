/** @feature CNT-12ee98aa
 *  Title   : Shared Container Store
 *  Source  : docs/client-features/cnt-shared-container-store-12ee98aa.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CNT-12ee98aa: Shared Container Store", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("container selector shows options", async ({ page }) => {
        await page.goto("/");
        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();
    });
});
