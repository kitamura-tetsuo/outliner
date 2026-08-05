import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0006
 *  Title   : Copy only applies to the outliner while the editor has focus
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

const ITEM_TEXT = "Item text that must not be copied";

test.describe("SLR-0006: Ctrl+C outside the editor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [ITEM_TEXT]);
    });

    test("copies the foreign input selection, not the item selection", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.waitForOutlinerItems(page);

        // Focus an item and leave a selection behind in the editor store
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        await page.evaluate(() => {
            const store = (globalThis as { editorOverlayStore?: any; }).editorOverlayStore;
            if (!store) throw new Error("editorOverlayStore is not exposed");
            const itemElement = document.querySelector("[data-item-id]");
            if (!itemElement) throw new Error("no outliner item found");
            const textLength = itemElement.querySelector(".item-text")?.textContent?.length ?? 0;
            store.setSelection({
                startItemId: itemElement.getAttribute("data-item-id"),
                startOffset: 0,
                endItemId: itemElement.getAttribute("data-item-id"),
                endOffset: textLength,
                userId: "local",
                isReversed: false,
            });
        });

        // Clear the copy marker so the assertion cannot pass on a stale value
        await page.evaluate(async () => {
            (globalThis as { lastCopiedText?: string; }).lastCopiedText = "";
            await navigator.clipboard.writeText("");
        });

        // Move the focus to an input outside the outliner and copy its content
        const searchInput = page.getByTestId("search-pages-input").first();
        await searchInput.click();
        await searchInput.fill("foreign input text");
        await searchInput.click({ clickCount: 3 });
        await page.keyboard.press("Control+c");
        await page.waitForTimeout(300);

        const clipboardText = await page.evaluate(async () => {
            try {
                return await navigator.clipboard.readText();
            } catch {
                return "";
            }
        });
        expect(clipboardText).toBe("foreign input text");

        // The editor must not have hijacked the copy
        const lastCopiedText = await page.evaluate(() =>
            (globalThis as { lastCopiedText?: string; }).lastCopiedText ?? ""
        );
        expect(lastCopiedText).not.toContain(ITEM_TEXT);
    });
});
