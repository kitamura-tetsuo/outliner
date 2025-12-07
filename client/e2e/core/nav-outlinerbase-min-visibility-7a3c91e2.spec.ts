import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

// OutlinerBase 最小可視化 + WS 404 ノイズ抑止のスモーク

test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
});

test("OutlinerBase anchor and main toolbar are visible; no WS '/projects/' 404 handshake", async ({ page }) => {
    // 1) OutlinerBase アンカーの可視性
    await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();

    // 2) メインツールバーの可視性
    // Use .main-toolbar class selector to find the real toolbar (not the app.html placeholder)
    await expect(page.locator('.main-toolbar[data-testid="main-toolbar"]').first()).toBeVisible();

    // 3) WebSocket 接続URLを収集し、末尾が '/projects/' の誤接続が無いことを確認
    const wsUrls: string[] = [];
    page.on("websocket", ws => {
        try {
            wsUrls.push(ws.url());
        } catch {}
    });

    // 若干待機して接続が発生する余地を与える
    await page.waitForTimeout(800);

    const hasTrailingProjects = wsUrls.some(u => /\/projects\/$/.test(u));
    expect(hasTrailingProjects, `Unexpected WS URLs: ${wsUrls.join(", ")}`).toBeFalsy();
});
