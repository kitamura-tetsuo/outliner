/** @feature SRE-001
 * Advanced Search & Replace
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRE-001: regex search and replace", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "apple pie",
            "banana pie",
        ]);
        // add second page
        await TestHelpers.createTestPageViaAPI(page, "page2", [
            "apple tart",
            "grape pie",
        ]);
    });

    test("regex search and global replace", async ({ page }) => {
        await page.keyboard.press("Control+f");
        await expect(page.locator("[data-testid=search-panel]")).toBeVisible();
        await page.locator(".search-input").fill("app.*e");
        await page.locator(".replace-input").fill("orange");
        await page.locator("input[type=checkbox]").check();
        await page.locator(".replace-all-btn").click();

        const texts = await page.evaluate(() => {
            const store = (window as any).appStore;
            return store.pages.current.map((p: any) => p.text);
        });
        expect(texts.some((t: string) => t.includes("orange"))).toBe(true);
    });
});
