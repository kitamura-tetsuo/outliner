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

        // Yjs 経由でコメント追加 x2 - use the currentPage approach which should match what the UI is using
        const idList = await page.evaluate((id) => {
            const gs: any = (window as any).generalStore;

            // Try accessing the item through the current page which is what the UI uses
            if (gs?.currentPage) {
                const items = gs.currentPage.items;
                for (let i = 0; i < items.length; i++) {
                    const it = items.at(i);
                    if (it && String(it.id) === String(id)) {
                        if (typeof it.addComment === "function") {
                            const r1 = it.addComment("tester", "a");
                            const r2 = it.addComment("tester", "b");
                            const found = [r1?.id || "", r2?.id || ""];

                            // Wait for the UI to potentially update
                            return found;
                        } else {
                            console.error("Item does not have addComment method");
                            return ["", ""];
                        }
                    }
                }
            }

            // Fallback - look in the project items if not found in current page
            if (gs?.project) {
                const items = gs.project.items;
                for (let i = 0; i < items.length; i++) {
                    const it = items.at(i);
                    if (it && String(it.id) === String(id)) {
                        if (typeof it.addComment === "function") {
                            const r1 = it.addComment("tester", "a");
                            const r2 = it.addComment("tester", "b");
                            const found = [r1?.id || "", r2?.id || ""];

                            // Wait for the UI to potentially update
                            return found;
                        } else {
                            console.error("Item does not have addComment method");
                            return ["", ""];
                        }
                    }
                }
            }

            console.error("Item with ID", id, "not found in either currentPage or project");
            return ["", ""]; // Return empty IDs to indicate failure
        }, itemId);

        // Wait for the comment count to update in the UI - give up to 10 seconds for the badge to update
        await expect(badge).toHaveText("2", { timeout: 10000 });

        // 1件削除
        await page.evaluate(([id, cid]) => {
            const gs: any = (window as any).generalStore;

            // Same approach for delete - try current page first
            if (gs?.currentPage) {
                const items = gs.currentPage.items;
                for (let i = 0; i < items.length; i++) {
                    const it = items.at(i);
                    if (it && String(it.id) === String(id)) {
                        if (typeof it.deleteComment === "function") {
                            it.deleteComment(cid);
                        } else {
                            console.error("Item does not have deleteComment method");
                        }
                        break;
                    }
                }
            } // Fallback to project items
            else if (gs?.project) {
                const items = gs.project.items;
                for (let i = 0; i < items.length; i++) {
                    const it = items.at(i);
                    if (it && String(it.id) === String(id)) {
                        if (typeof it.deleteComment === "function") {
                            it.deleteComment(cid);
                        } else {
                            console.error("Item does not have deleteComment method");
                        }
                        break;
                    }
                }
            }
        }, [itemId, idList[0]]);

        // Wait for the comment count to update after deletion
        await expect(badge).toHaveText("1", { timeout: 10000 });
    });
});
