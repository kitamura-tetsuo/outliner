import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-b6ebf516
 *  Title   : Paste text from the system clipboard
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("System clipboard paste", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("pastes text from clipboard", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        await page.evaluate(async () => {
            await navigator.clipboard.writeText("pasted text");
        });

        await TestHelpers.waitForOutlinerItems(page);
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.press("Control+v");
        await page.waitForTimeout(300);

        const text = await item.locator(".item-text").textContent();
        expect(text).toContain("pasted text");
    });

    test("copies text to system clipboard", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        await TestHelpers.waitForOutlinerItems(page);
        const item = page.locator(".outliner-item").first();

        // Focus the item and select all text
        await item.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Type something unique
        const uniqueText = "system copy test " + Date.now();
        await page.keyboard.type(uniqueText);
        await page.waitForTimeout(300);

        // Select all text using store directly for reliable E2E tests
        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const store = (window as any).editorOverlayStore;
            if (!store) return;
            const items = document.querySelectorAll("[data-item-id]");
            if (items.length < 1) return;
            const itemElement = items[0];
            const itemId = itemElement.getAttribute("data-item-id");

            // Get the total text length by finding the .item-text element
            const textElement = itemElement.querySelector(".item-text");
            const fullTextLength = textElement?.textContent?.length || 1000;

            store.setSelection({
                startItemId: itemId,
                startOffset: 0,
                endItemId: itemId,
                endOffset: fullTextLength,
                userId: "local",
                isReversed: false,
            });
        });
        await page.waitForTimeout(100);

        // Copy to system clipboard
        await page.evaluate(() => {
            document.execCommand("copy");
        });
        await page.waitForTimeout(300);

        // Verify clipboard content
        // Note: Playwright sometimes blocks actual system clipboard writes unless in specific contexts.
        // The app sets `lastCopiedText` globally during E2E tests, so we check both.
        const clipboardText = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-globals
            if ((window as any).lastCopiedText) {
                // eslint-disable-next-line no-restricted-globals
                return (window as any).lastCopiedText;
            }
            try {
                return await navigator.clipboard.readText();
            } catch {
                return "";
            }
        });

        expect(clipboardText).toContain(uniqueText);
    });
});
