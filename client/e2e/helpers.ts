import type { Locator, Page } from "@playwright/test";

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

/**
 * .outliner-item が minCount 以上になるまで待機し、ロケーターを返す
 */
export async function waitForOutlinerItems(page: Page, minCount = 2, timeoutMs = 5000): Promise<Locator> {
    const locator = page.locator(".outliner-item");
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const count = await locator.count();
        if (count >= minCount) return locator;
        await page.waitForTimeout(50);
    }
    throw new Error(`waitForOutlinerItems timeout: expected >= ${minCount}`);
}

/**
 * 目標数に満たない場合は「アイテム追加」ボタンで増やし、最終的に minCount 以上を保証
 */
export async function ensureOutlinerItemCount(page: Page, minCount = 4, maxTries = 8): Promise<void> {
    try {
        await waitForOutlinerItems(page, minCount, 5000);
        return;
    } catch (e) {
        // fallthrough
    }
    const addBtn = page.getByRole("button", { name: "アイテム追加" });
    for (let i = 0; i < maxTries; i++) {
        if (await addBtn.isVisible()) {
            await addBtn.click({ force: true });
        }
        const count = await page.locator(".outliner-item").count();
        if (count >= minCount) return;
        await page.waitForTimeout(80);
    }
    // 最後にもう一度待つ
    await waitForOutlinerItems(page, minCount, 3000);
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        mockFluidClient?: boolean;
        mockUser?: { id: string; name: string; email?: string; };
        mockFluidToken?: { token: string; user: { id: string; name: string; }; };
        getFluidTreeDebugData?: () => any;
        getFluidTreePathData?: (path?: string) => any;
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        fluidServerPort?: number;
        _alertMessage?: string | null;
        __FLUID_SERVICE__?: any;
        __SVELTE_GOTO__?: any;
        generalStore?: any;
        editorOverlayStore?: any;
        ScrapboxFormatter?: any;
        __FIRESTORE_STORE__?: any;
    }
}
