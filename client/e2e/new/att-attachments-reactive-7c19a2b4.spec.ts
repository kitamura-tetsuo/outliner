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
 * ケース: Yjs で attachments を追加・削除した際に UI が即時に反映される
 */

test.describe("ATT-7c19a2b4: attachments reflect Yjs add/remove", () => {
    test("add/remove attachment updates preview list", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "PAGE TITLE",
            "ITEM with attachments",
        ]);

        // Wait for items to be stable
        await TestHelpers.waitForOutlinerItems(page, 30000, 2);
        let itemId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!itemId) {
            await page.waitForTimeout(1000);
            itemId = await TestHelpers.getItemIdByIndex(page, 1);
        }
        if (!itemId) throw new Error("item id not found after retry");

        const selector = `[data-item-id="${itemId}"]`;
        const attachments = page.locator(`${selector} .attachments`);

        // 初期状態: 添付なし
        await expect(attachments).toHaveCount(0);

        // Yjs 経由で添付を追加
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

        // 1件のプレビューが表示
        await expect(page.locator(`${selector} .attachments img`)).toHaveCount(1);

        // 2件目追加
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

        // 1件削除
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
