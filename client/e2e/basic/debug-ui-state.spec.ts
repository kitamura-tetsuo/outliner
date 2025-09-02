import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Debug UI State", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Check current UI state", async ({ page }) => {
        // ページの基本情報を取得
        const pageInfo = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                bodyText: document.body.textContent?.substring(0, 200),
                hasOutlinerBase: !!document.querySelector('[data-testid="outliner-base"]'),
                hasOutlinerTree: !!document.querySelector(".outliner"),
                hasToolbar: !!document.querySelector(".toolbar"),
                hasAddButton: Array.from(document.querySelectorAll("button")).some(btn =>
                    btn.textContent?.includes("アイテム追加")
                ),
                allButtons: Array.from(document.querySelectorAll("button")).map(btn => btn.textContent?.trim()),
                outlinerHTML: document.querySelector(".outliner")?.innerHTML?.substring(0, 500),
            };
        });

        console.log("Page Info:", JSON.stringify(pageInfo, null, 2));

        // スクリーンショットを保存
        await page.screenshot({ path: "test-results/debug-ui-state.png", fullPage: true });

        // 基本的な要素の存在確認
        expect(pageInfo.hasOutlinerBase).toBe(true);

        // アイテム追加ボタンの存在確認
        if (!pageInfo.hasAddButton) {
            console.log("Add button not found. Available buttons:", pageInfo.allButtons);
            console.log("Outliner HTML:", pageInfo.outlinerHTML);
        }
    });
});
