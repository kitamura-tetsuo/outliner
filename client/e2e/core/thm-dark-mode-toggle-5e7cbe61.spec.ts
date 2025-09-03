/** @feature THM-0001
 *  Title   : Dark mode theme toggle
 *  Source  : docs/client-features/thm-dark-mode-toggle-5e7cbe61.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("THM-0001: Dark mode theme toggle", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("toggle dark mode", async ({ page }) => {
        await expect(page.evaluate(() => document.documentElement.classList.contains("dark"))).resolves.toBe(false);
        await page.getByRole("button", { name: "Dark Mode" }).click();
        await expect(page.evaluate(() => document.documentElement.classList.contains("dark"))).resolves.toBe(true);
    });
});
import "../utils/registerAfterEachSnapshot";
