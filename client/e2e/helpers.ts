import type { Page } from '@playwright/test';


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
