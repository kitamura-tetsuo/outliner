/** @feature MOB-0003
 *  Title   : Mobile Bottom Action Toolbar
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("MOB-0003: Mobile action toolbar", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 375, height: 700 });
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.type("One");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Two");
    });

    test("toolbar appears and performs actions", async ({ page }) => {
        const toolbar = page.locator("[data-testid='mobile-action-toolbar']");
        await expect(toolbar).toBeVisible();

        const items = page.locator(".outliner-item");
        const secondId = await items.nth(2).getAttribute("data-item-id");
        await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`).click({ force: true });
        const countBefore = await items.count();

        await toolbar.locator("button[aria-label='Indent']").click();
        await expect.poll(async () => {
            const rootItems: any = await TreeValidator.getTreePathData(page, "items.0.items");
            return Object.keys(rootItems || {}).length;
        }).toBe(countBefore - 1);

        await toolbar.locator("button[aria-label='Outdent']").click();
        await expect.poll(async () => {
            const rootItems: any = await TreeValidator.getTreePathData(page, "items.0.items");
            return Object.keys(rootItems || {}).length;
        }).toBe(countBefore);

        const siblingCountBefore = await items.count();
        await toolbar.locator("button[aria-label='Insert Above']").click();
        await expect(items).toHaveCount(siblingCountBefore + 1);

        await toolbar.locator("button[aria-label='Insert Below']").click();
        await expect(items).toHaveCount(siblingCountBefore + 2);

        await toolbar.locator("button[aria-label='New Child']").click();
        await page.waitForTimeout(500);
        const secondChildren = await page.locator(`.outliner-item[data-item-id="${secondId}"] .outliner-item`).count();
        expect(secondChildren).toBeGreaterThan(0);

        await toolbar.evaluate(el => {
            el.scrollLeft = el.scrollWidth;
        });
        const scrollLeft = await toolbar.evaluate(el => el.scrollLeft);
        expect(scrollLeft).toBeGreaterThan(0);
    });
});
