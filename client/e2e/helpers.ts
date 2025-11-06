import type { Page } from "@playwright/test";

/**
 * 指定数のアウトライナーアイテムが表示されるまで待機
 */
export async function waitForOutlinerItems(page: Page, count: number, timeout = 10000): Promise<void> {
    await page.waitForFunction(
        (expected) => document.querySelectorAll(".outliner-item[data-item-id]").length >= expected,
        count,
        { timeout },
    );
}

/**
 * アウトライナーアイテム数が不足していれば追加描画を待機
 */
export async function ensureOutlinerItemCount(page: Page, count: number, timeout = 10000): Promise<void> {
    const current = await page.locator(".outliner-item[data-item-id]").count();
    if (current < count) {
        await waitForOutlinerItems(page, count, timeout);
    }
}

/**
 * カーソルが表示されるのを待つ
 * @param page Playwrightのページオブジェクト
 * @param timeout タイムアウト時間（ミリ秒）
 */
export async function waitForCursorVisible(page: Page, timeout: number = 10000): Promise<boolean> {
    try {
        console.log("waitForCursorVisible: Starting to wait for cursor...");

        // グローバルテキストエリアがフォーカスされるまで待機
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: timeout });
        console.log("waitForCursorVisible: Global textarea is focused");

        // カーソル要素が存在し、表示されているかチェック
        // CursorValidatorを使用してカーソル情報を取得
        const cursorData = await page.evaluate(() => {
            // EditorOverlayStoreインスタンスを取得
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (!editorOverlayStore) {
                return { cursorCount: 0, activeCursors: 0 };
            }

            const cursors = Object.values(editorOverlayStore.cursors);
            const activeCursors = cursors.filter((c: any) => c.isActive);

            return {
                cursorCount: cursors.length,
                activeCursors: activeCursors.length,
            };
        });

        const cursorVisible = cursorData.activeCursors > 0;

        if (cursorVisible) {
            console.log("waitForCursorVisible: Cursor is visible");
            return true;
        } else {
            console.log("waitForCursorVisible: Cursor exists but not visible");
            return false;
        }
    } catch (error) {
        console.log("Error in waitForCursorVisible:", error);
        return false;
    }
}

// NOTE: e2e では Playwright/JSDOM 上の window 構造が実行時に変化するため、
// (window as any) などの any キャストを意図的に使用しています。型安全性よりも
// 実ブラウザ挙動の再現性・安定性を優先するテスト特有の緩和であり、
// 本番コードには any キャストを持ち込まない方針です。

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        mockUser?: { id: string; name: string; email?: string; };
        getYjsTreeDebugData?: () => any;
        getYjsTreePathData?: (path?: string) => any;
        getCursorDebugData?: () => unknown;
        getCursorPathData?: (path?: string) => unknown;
        _alertMessage?: string | null;
        __SVELTE_GOTO__?: any;
        generalStore?: any;
        ScrapboxFormatter?: any;
        __FIRESTORE_STORE__?: any;
    }
}
