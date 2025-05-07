import { Page } from '@playwright/test';

/**
 * テスト環境に応じたベースURLを取得する
 * @returns ベースURL（例: http://localhost:7090 または http://192.168.50.13:7080）
 */
export function getTestBaseUrl(): string {
    const isLocalhostEnv = process.env.TEST_ENV === 'localhost';
    const host = isLocalhostEnv ? 'localhost' : '192.168.50.13';
    const port = isLocalhostEnv ? '7090' : '7080';
    return `http://${host}:${port}`;
}

/**
 * テストページをセットアップする
 * @param page Playwrightのページオブジェクト
 * @param path オプションのパス（デフォルトは "/"）
 */
export async function setupTestPage(page: Page, path: string = "/"): Promise<void> {
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
    const baseUrl = getTestBaseUrl();
    await page.goto(`${baseUrl}${path}`);

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

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        mockFluidClient?: boolean;
        mockUser?: { id: string; name: string; email?: string; };
        mockFluidToken?: { token: string; user: { id: string; name: string; }; };
        getFluidTreeDebugData?: () => any;
        fluidServerPort?: number;
        _alertMessage?: string | null;
    }
}
