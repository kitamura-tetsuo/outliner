/** @feature CMT-0001
 *  Title   : Comment threads per item
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CMT-0001: comment threads", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "first line",
        ]);

        // Clean up any existing comments after environment preparation
        try {
            // Only attempt cleanup if the page is still open
            if (page.isClosed()) {
                console.log("[beforeEach] Page already closed, skipping comment cleanup");
                return;
            }

            await page.evaluate(() => {
                try {
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

                    // Also clear any existing Yjs comment data
                    try {
                        const yjsStore: any = (window as any).__YJS_STORE__;
                        if (yjsStore?.yjsClient) {
                            const client = yjsStore.yjsClient;
                            // Clear any pending comment operations
                            if (client.comments) {
                                client.comments.clear();
                            }
                        }
                    } catch (e) {
                        console.warn("Could not clear Yjs comment data:", e);
                    }

                    // Clear any global state that might interfere with this test
                    try {
                        const win: any = window as any;
                        // Clear any comment-related global variables
                        if (win.__COMMENT_THREAD_STATE__) {
                            win.__COMMENT_THREAD_STATE__ = {};
                        }

                        // Clear any editor overlay state that might affect cursor/comment positioning
                        if (win.editorOverlayStore) {
                            const editorStore = win.editorOverlayStore;
                            if (typeof editorStore.reset === "function") {
                                editorStore.reset();
                            } else {
                                // Manual reset if no reset method
                                editorStore.cursors = {};
                                editorStore.activeItemId = null;
                                editorStore.cursorVisible = false;
                                if (editorStore.cursorInstances) {
                                    editorStore.cursorInstances.clear();
                                }
                            }
                        }

                        // Clear any comment-related state in generalStore
                        if (gs?.commentThreads) {
                            gs.commentThreads.clear();
                        }

                        // Clear any pending timeouts or intervals that might affect state
                        if (win.__CLEANUP_TIMEOUTS__) {
                            for (const tid of win.__CLEANUP_TIMEOUTS__) {
                                clearTimeout(tid);
                            }
                            win.__CLEANUP_TIMEOUTS__ = [];
                        }
                    } catch (e) {
                        console.warn("Could not clear global state:", e);
                    }
                } catch (e) {
                    console.warn("Error during comment cleanup:", e);
                }
            });
        } catch (e) {
            // If page is closed or evaluation fails, just log and continue
            console.warn("Could not perform comment cleanup:", e?.message ?? e);
        }
    });

    test("add, edit and remove comment", async ({ page }, testInfo) => {
        // Using TestHelpers.prepareTestEnvironment from beforeEach ensures we have a fresh page for this test
        await TestHelpers.waitForOutlinerItems(page);
        // インデックス1を使用（インデックス0はページタイトルでコメントボタンが表示されない）
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!firstId) throw new Error("item id not found");

        // First, wait for the comment button to be visible and ready
        const commentButton = page.locator(`[data-item-id="${firstId}"] [data-testid="comment-button-${firstId}"]`);
        await expect(commentButton).toBeVisible();

        // Add extra wait to ensure the page is fully loaded and stable
        await page.waitForTimeout(500);

        // Click the comment button
        await commentButton.click();

        // Wait for the comment thread to appear with increased timeout
        // Use a more specific locator to ensure we're waiting for the right thread
        await expect(page.locator(`[data-item-id="${firstId}"] [data-testid="comment-thread"]`)).toBeVisible({
            timeout: 15000,
        });

        await page.fill('[data-testid="new-comment-input"]', "hello");
        const addBtns = page.locator('[data-testid="add-comment-btn"]');
        const addCount = await addBtns.count();
        // eslint-disable-next-line no-console
        console.log("DEBUG add-btn count:", addCount);
        // Try narrowing to the currently visible thread
        const thread = page.locator(`[data-item-id="${firstId}"] [data-testid="comment-thread"]`);
        const addInThread = thread.locator('[data-testid="add-comment-btn"]');
        // eslint-disable-next-line no-console
        console.log("DEBUG add-btn in thread visible:", await addInThread.isVisible());
        await addInThread.click();

        // Wait for comment count to appear and have the correct value
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toBeVisible();
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toHaveText("1");

        // Wait for the comment element to appear with specific text, which indicates successful sync
        await expect(page.locator('[data-testid="comment-thread"] .text')).toContainText("hello", { timeout: 15000 });

        // Now verify the comment exists
        const comment = page.locator('[data-testid="comment-thread"] .comment');
        await expect(comment).toHaveCount(1);

        // Get the comment ID for more specific selectors
        const commentTestId = await comment.getAttribute("data-testid");
        const commentId = commentTestId?.replace("comment-", "") || "";

        // 編集ボタンをクリック
        await page.click(`[data-testid="comment-${commentId}"] .edit`);

        // 編集入力フィールドが表示されるまで待機
        await expect(page.locator(`[data-testid="edit-input-${commentId}"]`)).toBeVisible();

        // 編集入力フィールドをクリアしてから新しいテキストを入力
        await page.fill(`[data-testid="edit-input-${commentId}"]`, "");
        await page.fill(`[data-testid="edit-input-${commentId}"]`, "edited");

        // 保存ボタンをクリック
        await page.click(`[data-testid="save-edit-${commentId}"]`);

        // 編集モードが終了するまで待機
        await expect(page.locator(`[data-testid="edit-input-${commentId}"]`)).not.toBeVisible();

        // Wait for the text to be updated with a longer timeout to ensure edit operation completes
        // Use a more specific selector to ensure we're checking the right comment
        await expect(page.locator(`[data-testid="comment-${commentId}"] .text`)).toHaveText("edited", {
            timeout: 15000,
        });

        await page.click(`[data-testid="comment-${commentId}"] .delete`);
        // Wait for comment count to disappear
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).not.toBeVisible();
    });

    test.afterEach(async ({ page }) => {
        // Explicitly clean up any comment data to ensure test isolation
        try {
            // Only attempt cleanup if the page is still open
            if (page.isClosed()) {
                console.log("[afterEach] Page already closed, skipping comment cleanup");
                return;
            }

            await page.evaluate(() => {
                try {
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

                    // Also clear any existing Yjs comment data
                    try {
                        const yjsStore: any = (window as any).__YJS_STORE__;
                        if (yjsStore?.yjsClient) {
                            const client = yjsStore.yjsClient;
                            // Clear any pending comment operations
                            if (client.comments) {
                                client.comments.clear();
                            }
                        }
                    } catch (e) {
                        console.warn("Could not clear Yjs comment data:", e);
                    }

                    // Clear any pending timeouts or intervals that might affect state
                    try {
                        const win: any = window as any;
                        if (win.__CLEANUP_TIMEOUTS__) {
                            for (const tid of win.__CLEANUP_TIMEOUTS__) {
                                clearTimeout(tid);
                            }
                            win.__CLEANUP_TIMEOUTS__ = [];
                        }
                    } catch (e) {
                        console.warn("Could not clear timeouts:", e);
                    }

                    // Clear any global state that might interfere with other tests
                    try {
                        const win: any = window as any;
                        // Clear any comment-related global variables
                        if (win.__COMMENT_THREAD_STATE__) {
                            win.__COMMENT_THREAD_STATE__ = {};
                        }

                        // Clear any editor overlay state that might affect cursor/comment positioning
                        if (win.editorOverlayStore) {
                            const editorStore = win.editorOverlayStore;
                            if (typeof editorStore.reset === "function") {
                                editorStore.reset();
                            } else {
                                // Manual reset if no reset method
                                editorStore.cursors = {};
                                editorStore.activeItemId = null;
                                editorStore.cursorVisible = false;
                                if (editorStore.cursorInstances) {
                                    editorStore.cursorInstances.clear();
                                }
                            }
                        }

                        // Clear any comment-related state in generalStore
                        if (gs?.commentThreads) {
                            gs.commentThreads.clear();
                        }
                    } catch (e) {
                        console.warn("Could not clear global comment state:", e);
                    }
                } catch (e) {
                    console.warn("Error during comment cleanup:", e);
                }
            });
        } catch (e) {
            // If page is closed or evaluation fails, just log and continue
            console.warn("Could not perform comment cleanup:", e?.message ?? e);
        }
    });
});
import "../utils/registerAfterEachSnapshot";
