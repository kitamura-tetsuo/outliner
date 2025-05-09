import { Page, expect } from "@playwright/test";
import { CursorValidator } from "./cursorValidation";
import { TreeValidator } from "./treeValidation";

/**
 * テスト用のヘルパー関数群
 */
export class TestHelpers {
    /**
     * カーソルデバッグ機能をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    static async setupCursorDebugger(page: Page): Promise<void> {
        await page.evaluate(() => {
            // グローバルオブジェクトにデバッグ関数を追加
            window.getCursorDebugData = function() {
                // EditorOverlayStoreインスタンスを取得
                const editorOverlayStore = window.editorOverlayStore;
                if (!editorOverlayStore) {
                    console.error("EditorOverlayStore instance not found");
                    return { error: "EditorOverlayStore instance not found" };
                }

                try {
                    // カーソル情報を取得
                    const cursors = Object.values(editorOverlayStore.cursors);
                    const selections = Object.values(editorOverlayStore.selections);
                    const activeItemId = editorOverlayStore.activeItemId;
                    const cursorVisible = editorOverlayStore.cursorVisible;

                    // カーソルインスタンスの情報を取得
                    const cursorInstances: Array<any> = [];

                    editorOverlayStore.cursorInstances.forEach((cursor: any, id: string) => {
                        cursorInstances.push({
                            cursorId: id,
                            itemId: cursor.itemId,
                            offset: cursor.offset,
                            isActive: cursor.isActive,
                            userId: cursor.userId
                        });
                    });

                    return {
                        cursors,
                        selections,
                        activeItemId,
                        cursorVisible,
                        cursorInstances,
                        cursorCount: cursors.length,
                        selectionCount: selections.length
                    };
                } catch (error) {
                    console.error("Error getting cursor data:", error);
                    return { error: error.message || "Unknown error" };
                }
            };

            // 特定のパスのデータを取得する関数
            window.getCursorPathData = function(path?: string) {
                const data = window.getCursorDebugData();
                if (!path) return data;

                return path.split('.').reduce((prev, curr) => {
                    return prev && prev[curr];
                }, data);
            };
        });
    }

    /**
     * SharedTreeデバッグ機能をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    static async setupTreeDebugger(page: Page): Promise<void> {
        await page.evaluate(() => {
            // グローバルオブジェクトにデバッグ関数を追加
            window.getFluidTreeDebugData = function() {
                // generalStoreインスタンスを取得
                const generalStore = window.generalStore;
                if (!generalStore) {
                    console.error("generalStore instance not found");
                    return { error: "generalStore instance not found" };
                }

                try {
                    // ルートアイテムを取得
                    const rootItem = generalStore.currentPage;
                    if (!rootItem) {
                        return { error: "Root item not found" };
                    }

                    // アイテム数をカウント
                    let itemCount = 0;
                    const items: any[] = [];

                    // アイテムを再帰的に処理する関数
                    function processItem(item: any, depth = 0): any {
                        itemCount++;
                        const result: any = {
                            id: item.id,
                            text: item.text,
                            author: item.author,
                            votes: item.votes || [],
                            created: item.created,
                            lastChanged: item.lastChanged
                        };

                        // 子アイテムを処理
                        if (item.items && typeof item.items[Symbol.iterator] === 'function') {
                            result.items = [];
                            for (const child of item.items) {
                                result.items.push(processItem(child, depth + 1));
                            }
                        }

                        return result;
                    }

                    // ルートアイテムから処理開始
                    items.push(processItem(rootItem));

                    return {
                        itemCount,
                        items
                    };
                } catch (error) {
                    console.error("Error getting tree data:", error);
                    return { error: error.message || "Unknown error" };
                }
            };
        });
    }

    /**
     * カーソルが表示されるまで待機する
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    static async waitForCursorVisible(page: Page, timeout = 5000): Promise<boolean> {
        try {
            await page.waitForFunction(() => {
                const cursor = document.querySelector('.editor-overlay .cursor.active');
                return cursor && window.getComputedStyle(cursor).opacity !== '0';
            }, { timeout });
            return true;
        } catch (error) {
            console.log("Timeout waiting for cursor to be visible, continuing anyway");
            // スクリーンショットを撮影して状態を確認
            await page.screenshot({ path: "test-results/cursor-visible-timeout.png" });
            return false;
        }
    }

    /**
     * アクティブなアイテムIDを取得する
     * @param page Playwrightのページオブジェクト
     * @returns アクティブなアイテムID
     */
    static async getActiveItemId(page: Page): Promise<string | null> {
        const cursorData = await CursorValidator.getCursorData(page);
        return cursorData.activeItemId;
    }

    /**
     * アクティブなアイテム要素を取得する
     * @param page Playwrightのページオブジェクト
     * @returns アクティブなアイテム要素のロケーター
     */
    static async getActiveItemLocator(page: Page): Promise<any> {
        const activeItemId = await this.getActiveItemId(page);
        if (!activeItemId) return null;

        return page.locator(`.outliner-item[data-item-id="${activeItemId}"] .item-content`);
    }

    /**
     * アイテムをクリックして編集モードに入る
     * @param page Playwrightのページオブジェクト
     * @param itemSelector アイテムを特定するセレクタ
     */
    static async clickItemToEdit(page: Page, itemSelector: string): Promise<void> {
        await page.click(itemSelector);
        await this.waitForCursorVisible(page);

        // カーソルが表示されていることを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    }
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        getFluidTreeDebugData?: () => any;
    }
}
