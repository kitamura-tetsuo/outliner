import type { Page } from "@playwright/test";

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
        const cursorVisible = await page.evaluate(() => {
            const cursors = document.querySelectorAll(".editor-overlay .cursor.active");

            console.log("Cursor visibility check:", {
                totalCursors: cursors.length,
                cursorsVisible: Array.from(cursors).map(cursor => {
                    const style = window.getComputedStyle(cursor as Element);
                    return {
                        display: style.display,
                        visibility: style.visibility,
                        opacity: style.opacity,
                        width: style.width,
                        height: style.height
                    };
                })
            });

            // アクティブなカーソルが存在し、表示されているかチェック
            return Array.from(cursors).some(cursor => {
                const style = window.getComputedStyle(cursor as Element);
                return style.display !== 'none' &&
                       style.visibility !== 'hidden' &&
                       parseFloat(style.opacity) > 0;
            });
        });

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
    }
}
