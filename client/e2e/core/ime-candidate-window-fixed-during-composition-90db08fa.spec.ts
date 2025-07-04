/** @feature IME-0004
 *  Title   : IME candidate window remains fixed during composition
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IME-0004: IME candidate window remains fixed during composition", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("textarea position stays constant while composing", async ({ page }) => {
        const item = page.locator(".outliner-item.page-title");
        if (await item.count() === 0) {
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();

        await TestHelpers.waitForCursorVisible(page);

        const initialPos = await textarea.evaluate(el => ({ left: el.style.left, top: el.style.top }));

        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "に" }));
        });
        await page.waitForTimeout(50);
        const posAfterUpdate = await textarea.evaluate(el => ({ left: el.style.left, top: el.style.top }));
        expect(posAfterUpdate).toEqual(initialPos);

        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほ" }));
        });
        await page.waitForTimeout(50);
        const posAfterSecond = await textarea.evaluate(el => ({ left: el.style.left, top: el.style.top }));
        expect(posAfterSecond).toEqual(initialPos);

        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionend", { data: "日本" }));
        });
    });
});
