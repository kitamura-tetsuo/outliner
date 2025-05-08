import { Page } from '@playwright/test';

/**
 * テストページをセットアップする
 * @param page Playwrightのページオブジェクト
 * @param path オプションのパス（デフォルトは "/"）
 */
export async function setupTestPage(page: Page): Promise<void> {
    // 認証状態を設定
    await page.addInitScript(() => {
        window.localStorage.setItem("authenticated", "true");

        // アラートを上書き
        window.alert = function (message) {
            window._alertMessage = message;
            console.log("Alert:", message);
        };
    });

    // 環境に応じたURLでアプリを開く
    await page.goto("/");

    // OutlinerItem がレンダリングされるのを待つ
    await page.waitForSelector(".outliner-item");
}

/**
 * カーソルが表示されるのを待つ
 * @param page Playwrightのページオブジェクト
 */
export async function waitForCursorVisible(page: Page): Promise<void> {
    await page.waitForSelector('.cursor', { state: 'visible' });
}

/**
 * SharedTreeデータ取得用のデバッグ関数をセットアップする
 * @param page Playwrightのページオブジェクト
 */
export async function setupTreeDebugger(page: Page): Promise<void> {
    await page.addInitScript(() => {
        // グローバルオブジェクトにデバッグ関数を追加
        window.getFluidTreeDebugData = function() {
            // グローバルFluidClientインスタンスを取得
            const fluidClient = window.__FLUID_CLIENT__;
            if (!fluidClient) {
                console.error("FluidClient instance not found");
                return { error: "FluidClient instance not found" };
            }

            try {
                // FluidClientのgetAllDataメソッドを使用してデータを取得
                const treeData = fluidClient.getAllData();
                return treeData;
            } catch (error) {
                console.error("Error getting tree data:", error);
                return { error: error.message || "Unknown error" };
            }
        };

        // 拡張版のデバッグ関数 - 特定のパスのデータのみを取得
        window.getFluidTreePathData = function(path) {
            const fluidClient = window.__FLUID_CLIENT__;
            if (!fluidClient) {
                return { error: "FluidClient instance not found" };
            }

            try {
                const treeData = fluidClient.getAllData();
                if (!path) return treeData;

                // パスに基づいてデータを取得
                const parts = path.split('.');
                let result = treeData;
                for (const part of parts) {
                    if (result === undefined || result === null) return null;
                    result = result[part];
                }
                return result;
            } catch (error) {
                return { error: error.message || "Unknown error" };
            }
        };
    });
}

/**
 * テスト用のアイテムを作成する
 * @param page Playwrightのページオブジェクト
 * @param texts 作成するアイテムのテキスト配列
 */
export async function createTestItems(page: Page, texts: string[]): Promise<void> {
    // 最初のアイテムをクリックして選択
    await page.locator(".outliner-item").first().click();
    await page.waitForTimeout(100);

    // 各テキストを入力
    for (let i = 0; i < texts.length; i++) {
        await page.keyboard.type(texts[i]);
        if (i < texts.length - 1) {
            await page.keyboard.press("Enter");
            await page.waitForTimeout(100);
        }
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
        fluidServerPort?: number;
        _alertMessage?: string | null;
        __FLUID_CLIENT__?: any;
    }
}
