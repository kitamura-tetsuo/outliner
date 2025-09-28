/** @feature CMT-5fd8c210
 *  Title   : OutlinerItem comment badge reflects Yjs count (max logic)
 *  Source  : docs/client-features/cmt-comment-badge-max-5fd8c210.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";

/**
 * ケース: Yjs 側でコメント追加/削除し、commentCountVisual が正しい最大値を表示
 */

test.describe("CMT-5fd8c210: comment badge reflects Yjs count", () => {
    test("Yjs add/remove updates badge count", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "PAGE TITLE",
            "COMMENT TARGET",
        ]);

        const itemId = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll<HTMLElement>(".outliner-item[data-item-id] .item-text"));
            for (const n of nodes) {
                const t = (n.innerText || n.textContent || "").trim();
                if (t === "COMMENT TARGET") {
                    const item = n.closest<HTMLElement>(".outliner-item[data-item-id]");
                    return item?.dataset.itemId ?? null;
                }
            }
            return null as any;
        });
        if (!itemId) throw new Error("item id not found");

        // コメントボタンを押してスレッドを表示（OutlinerItem 側の購読がより確実になる）
        await page.click(`[data-item-id="${itemId}"] [data-testid="comment-button-${itemId}"]`);
        await expect(page.locator('[data-testid="comment-thread"]')).toBeVisible();

        const badge = page.locator(`[data-item-id="${itemId}"] .comment-count`);

        // Yjs 経由でコメント追加 x2
        const idList = await page.evaluate((id) => {
            const gs: any = (window as any).generalStore;
            const items = gs?.currentPage?.items as any;
            const len = items?.length ?? 0;
            const found = [] as string[];
            for (let i = 0; i < len; i++) {
                const it = items.at ? items.at(i) : items[i];
                if (String(it.id) === String(id)) {
                    const r1 = it.addComment("tester", "a");
                    const r2 = it.addComment("tester", "b");
                    found.push(r1?.id || "", r2?.id || "");
                    // UI再評価トリガ: テキストを微変更
                    try {
                        it.updateText(String(it.text?.toString?.() ?? "") + " ");
                    } catch {}
                    break;
                }
            }
            return found;
        }, itemId);

        await expect(badge).toHaveText("2");

        // 1件削除
        await page.evaluate(([id, cid]) => {
            const gs: any = (window as any).generalStore;
            const items = gs?.currentPage?.items as any;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = items.at ? items.at(i) : items[i];
                if (String(it.id) === String(id)) {
                    it.deleteComment(cid);
                    break;
                }
            }
        }, [itemId, idList[0]]);

        await expect(badge).toHaveText("1");
    });
});
