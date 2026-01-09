import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Debug Page Load", () => {
    test("debug page loading process", async ({ page }, testInfo) => {
        console.log("Debug: Starting page load test with standard initialization");

        // Use standard test environment initialization
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        console.log("Debug: Environment prepared");

        // ページの最終状態を確認
        const finalState = await page.evaluate(() => {
            const generalStore = (window as any).generalStore;
            return {
                url: window.location.href,
                outlinerBase: !!document.querySelector('[data-testid="outliner-base"]'),
                outlinerItems: document.querySelectorAll(".outliner-item").length,
                addButton: !!Array.from(document.querySelectorAll("button")).find(btn =>
                    btn.textContent?.includes("アイテム追加")
                ),
                generalStore: generalStore
                    ? {
                        hasProject: !!generalStore.project,
                        hasPages: !!generalStore.pages,
                        hasCurrentPage: !!generalStore.currentPage,
                        pagesCount: generalStore.pages?.current?.length || 0,
                    }
                    : null,
            };
        });

        console.log("Debug: Final state:", finalState);

        // Verify basic requirements
        expect(finalState.outlinerBase).toBe(true);
        expect(finalState.outlinerItems).toBeGreaterThan(0);
        expect(finalState.generalStore?.hasProject).toBe(true);
        expect(finalState.generalStore?.hasCurrentPage).toBe(true);

        // スクリーンショットを保存
        await page.screenshot({ path: "test-results/debug-final-state.png" });
    });
});
