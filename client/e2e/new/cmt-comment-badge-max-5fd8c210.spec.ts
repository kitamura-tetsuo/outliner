import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CMT-5fd8c210
 *  Title   : OutlinerItem comment badge reflects Yjs count (max logic)
 *  Source  : docs/client-features/cmt-comment-badge-max-5fd8c210.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * ケース: Yjs 側でコメント追加/削除し、commentCountVisual が正しい最大値を表示
 */

test.describe("CMT-5fd8c210: comment badge reflects Yjs count", () => {
    test.afterEach(async ({ page }) => {
        // Explicitly clean up any comment data to ensure test isolation
        await page.evaluate(() => {
            // Clear comment data from the current page items if possible
            const gs: any = (window as any).generalStore;
            if (gs?.currentPage?.items) {
                const items = gs.currentPage.items;
                const len = items?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const item = items.at(i);
                    if (item && typeof item.getComments === "function") {
                        // Try to clear comments if there's a method available
                        try {
                            const comments = item.getComments();
                            if (comments && Array.isArray(comments) && comments.length > 0) {
                                for (const comment of comments) {
                                    if (comment.id && typeof item.deleteComment === "function") {
                                        item.deleteComment(comment.id);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn("Could not clear comments for item:", e);
                        }
                    }
                }
            }
        }).catch((e) => {
            // If page is closed or evaluation fails, just log and continue
            console.warn("Could not perform comment cleanup:", e?.message ?? e);
        });
    });

    test("Yjs add/remove updates badge count", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "PAGE TITLE",
            "COMMENT TARGET",
        ]);

        // Wait for outliner items to be loaded before querying for items
        // This is necessary because Yjs sync may take time for seeded data to appear
        await page.waitForSelector(".outliner-item[data-item-id]", { timeout: 30000 }).catch(() => {
            console.log("Warning: Outliner items not found within timeout, continuing anyway");
        });

        // Wait for the specific "COMMENT TARGET" text to appear
        await page.waitForSelector(".outliner-item .item-text", { hasText: "COMMENT TARGET" }, { timeout: 30000 })
            .catch(() => {
                console.log("Warning: 'COMMENT TARGET' text not found within timeout, continuing anyway");
            });

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
            // Helper to delete comment from item
            const deleteFromItem = (it: any) => {
                if (typeof it.deleteComment === "function") {
                    it.deleteComment(cid);
                    return true;
                }
                // Fallback: items from current page might be proxies/POJOs missing prototype methods.
                // Try accessing comments property directly.
                if (it.comments && typeof it.comments.deleteComment === "function") {
                    it.comments.deleteComment(cid);
                    return true;
                }
                return false;
            };

            // Try current page first
            if (gs?.currentPage) {
                const items = gs.currentPage.items;
                for (let i = 0; i < items.length; i++) {
                    const it = items.at(i);
                    if (it && String(it.id) === String(id)) {
                        deleteFromItem(it);
                        return;
                    }
                }
            }

            // Fallback to project items
            if (gs?.project) {
                const items = gs.project.items;
                for (let i = 0; i < items.length; i++) {
                    const it = items.at(i);
                    if (it && String(it.id) === String(id)) {
                        deleteFromItem(it);
                        return;
                    }
                }
            }
        }, [itemId, idList[0]]);

        // Wait for the comment count to update after deletion
        await expect(badge).toHaveText("1", { timeout: 10000 });
    });
});
