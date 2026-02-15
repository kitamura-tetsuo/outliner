import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ATT-7c19a2b4
 *  Title   : Attachments react to Yjs add/remove immediately
 *  Source  : docs/client-features/att-attachments-reactive-7c19a2b4.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Case: Attachments are immediately reflected in the UI when added/removed via Yjs
 */

test.describe("ATT-7c19a2b4: attachments reflect Yjs add/remove", () => {
    test("add/remove attachment updates preview list", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "PAGE TITLE",
            "ITEM with attachments",
        ]);

        // Wait for items to be stable
        await TestHelpers.waitForOutlinerItems(page, 2, 30000);
        let itemId = await TestHelpers.getItemIdByIndex(page, 1);

        // Robust retry for item ID
        for (let i = 0; i < 3; i++) {
            if (itemId) break;
            await page.waitForTimeout(1000);
            itemId = await TestHelpers.getItemIdByIndex(page, 1);
        }

        if (!itemId) throw new Error("item id not found after retry");

        const selector = `[data-item-id="${itemId}"]`;
        const attachments = page.locator(`${selector} .attachments`);

        // Initial state: No attachments
        await expect(attachments).toHaveCount(0);

        // Add attachment via Yjs
        const url1 = "https://example.com/a.png";
        await page.evaluate(([id, url]) => {
            const gs: any = (window as any).generalStore;
            const items = gs?.currentPage?.items as any;
            if (!items) throw new Error("items not found");
            const len = items.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = items.at ? items.at(i) : items[i];
                if (String(it.id) === String(id)) {
                    it.addAttachment(url);
                    break;
                }
            }
        }, [itemId, url1]);

        // 1 preview displayed
        await expect(page.locator(`${selector} .attachments img`)).toHaveCount(1);

        // Add 2nd attachment
        const url2 = "https://example.com/b.png";
        await page.evaluate(([id, url]) => {
            const gs: any = (window as any).generalStore;
            const items = gs?.currentPage?.items as any;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = items.at ? items.at(i) : items[i];
                if (String(it.id) === String(id)) {
                    it.addAttachment(url);
                    break;
                }
            }
        }, [itemId, url2]);

        await expect(page.locator(`${selector} .attachments img`)).toHaveCount(2);

        // Remove 1 attachment
        await page.evaluate(([id, url]) => {
            const gs: any = (window as any).generalStore;
            const items = gs?.currentPage?.items as any;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = items.at ? items.at(i) : items[i];
                if (String(it.id) === String(id)) {
                    it.removeAttachment(url);
                    break;
                }
            }
        }, [itemId, url1]);

        await expect(page.locator(`${selector} .attachments img`)).toHaveCount(1);
    });
});
