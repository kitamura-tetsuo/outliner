import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

// OutlinerBase minimal visibility + WS 404 noise suppression smoke test

test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(90000); // Increase timeout for CI environment
    await TestHelpers.prepareTestEnvironment(page, testInfo);
});

test("OutlinerBase anchor and main toolbar are visible; no WS '/projects/' 404 handshake", async ({ page }) => {
    // 1) OutlinerBase anchor visibility
    await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();

    // 2) Main toolbar visibility
    // Use .main-toolbar class selector to find the real toolbar (not the app.html placeholder)
    await expect(page.locator('.main-toolbar[data-testid="main-toolbar"]').first()).toBeVisible();

    // 3) Collect WebSocket connection URLs and confirm there are no erroneous connections ending in '/projects/'
    const wsUrls: string[] = [];
    page.on("websocket", ws => {
        try {
            wsUrls.push(ws.url());
        } catch {}
    });

    // Wait a little to allow time for connections to occur
    await page.waitForTimeout(800);

    const hasTrailingProjects = wsUrls.some(u => /\/projects\/$/.test(u));
    expect(hasTrailingProjects, `Unexpected WS URLs: ${wsUrls.join(", ")}`).toBeFalsy();
});
