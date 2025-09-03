/** @feature FTR-b6ebf516
 *  Title   : Paste text from the system clipboard
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("System clipboard paste", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("pastes text from clipboard", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        await page.evaluate(async () => {
            await navigator.clipboard.writeText("pasted text");
        });

        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.press("Control+v");
        await page.waitForTimeout(500);

        const text = await item.locator(".item-text").textContent();
        expect(text).toContain("pasted text");
    });
});
import "../utils/registerAfterEachSnapshot";
