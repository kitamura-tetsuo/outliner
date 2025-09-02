/** @feature FMT-0005
 *  Title   : VS Code style clipboard behavior
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("VS Code clipboard behavior", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["first line", "second line"]);
    });
    test("paste multicursor text via vscode metadata", async ({ page }) => {
        // アイテムが確実に作成されるまで待機（実際には2つのアイテムが作成される）
        await expect(page.locator(".outliner-item")).toHaveCount(2, { timeout: 10000 });

        const firstId = await page.locator(".outliner-item").nth(0).getAttribute("data-item-id");

        const secondId = await page.locator(".outliner-item").nth(1).getAttribute("data-item-id");

        await TestHelpers.setCursor(page, firstId!, 0, "user1");

        await TestHelpers.setCursor(page, secondId!, 0, "user2");

        await TestHelpers.waitForCursorVisible(page);
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.evaluate(async () => {
            const data = new DataTransfer();

            data.setData("text/plain", "AAA\nBBB");

            const metadata = {
                version: 1,

                isFromEmptySelection: false,

                multicursorText: ["AAA", "BBB"],

                mode: "plaintext",

                pasteMode: "spread",
            };

            data.setData("application/vscode-editor", JSON.stringify(metadata));

            const evt = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
            const handler = (window as any).__KEY_EVENT_HANDLER__;

            await handler.handlePaste(evt);
        });
        await page.waitForTimeout(500);

        const last = await page.evaluate(() => (window as any).lastPastedText);
        expect(last).toBe("AAA\nBBB");
    });
    test("paste box selection via vscode metadata", async ({ page }) => {
        // アイテムが確実に作成されるまで待機（実際には2つのアイテムが作成される）
        await expect(page.locator(".outliner-item")).toHaveCount(2, { timeout: 10000 });

        const firstId = await page.locator(".outliner-item").nth(0).getAttribute("data-item-id");

        const secondId = await page.locator(".outliner-item").nth(1).getAttribute("data-item-id");

        await TestHelpers.setCursor(page, firstId!, 0, "user1");

        await TestHelpers.setCursor(page, secondId!, 0, "user2");

        await page.evaluate(async () => {
            const data = new DataTransfer();

            data.setData("text/plain", "111\n222");

            const metadata = { version: 1, isFromEmptySelection: false, mode: "plaintext" };

            data.setData("application/vscode-editor", JSON.stringify(metadata));
            const evt = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
            const handler = (window as any).__KEY_EVENT_HANDLER__;

            await handler.handlePaste(evt);
        });
        await page.waitForTimeout(500);

        const last = await page.evaluate(() => (window as any).lastPastedText);
        expect(last).toBe("111\n222");
    });
});
