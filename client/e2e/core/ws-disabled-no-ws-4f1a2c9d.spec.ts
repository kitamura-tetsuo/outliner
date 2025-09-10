import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// VITE_YJS_DISABLE_WS=true の場合に WebSocket が一切開かれないことを確認するスモーク

test("WS disabled environment: no WebSocket connections should be opened", async ({ page }, testInfo) => {
    const wsUrls: string[] = [];
    page.on("websocket", ws => {
        try {
            wsUrls.push(ws.url());
        } catch {}
    });

    // TestHelpers 内で addInitScript により VITE_YJS_DISABLE_WS=true が適用される
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Vite HMR 等の開発用 WS を除外し、Yjs 系のみをカウント
    await page.waitForTimeout(800);
    const yjsWs = wsUrls.filter(u => /7093|\/yjs|\/projects\//.test(u));
    expect(yjsWs.length, `Unexpected Yjs WS URLs: ${yjsWs.join(", ")}`).toBe(0);
});
