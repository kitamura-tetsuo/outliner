/** @feature IME-0003
 *  Title   : IME composition underline follows active cursor
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IME-0003: IME composition underline follows cursor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("textarea has ime-input class during composition", async ({ page }) => {
        const item = page.locator(".outliner-item.page-title");
        if (await item.count() === 0) {
            const visible = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visible.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();
        await TestHelpers.waitForCursorVisible(page);

        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "a" }));
        });
        await page.waitForTimeout(50);
        await expect(textarea).toHaveClass(/ime-input/);
        const width = await textarea.evaluate(el => parseFloat(getComputedStyle(el).width));
        expect(width).toBeGreaterThan(1);

        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionend", { data: "a" }));
        });
        await page.waitForTimeout(50);
        await expect(textarea).not.toHaveClass(/ime-input/);
    });
});
import "../utils/registerAfterEachSnapshot";
