/** @feature FMT-0005
 * Title   : Visual Studio Codeのコピー/ペースト仕様 - マルチカーソル
 * Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Multi-cursor paste behaviour tests
 */

test.describe("マルチカーソル ペースト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("シングルカーソルからマルチカーソルへのペースト(spread)", async ({ page }) => {
        const items = page.locator(".outliner-item");
        await items.first().locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("first");
        await page.keyboard.press("Enter");
        await page.keyboard.type("second");
        await page.keyboard.press("Enter");
        await page.keyboard.type("third");

        // add multi cursors via Alt+click
        await items.nth(0).locator(".item-text").click({ modifiers: ["Alt"] });
        await items.nth(1).locator(".item-text").click({ modifiers: ["Alt"] });
        await items.nth(2).locator(".item-text").click({ modifiers: ["Alt"] });

        // dispatch paste event with VSCode metadata
        const lines = ["A", "B", "C"];
        await page.evaluate((lines) => {
            const dt = new DataTransfer();
            dt.setData("text/plain", lines.join("\n"));
            dt.setData("application/vscode-editor", JSON.stringify({
                version: 1,
                multicursorText: lines,
                pasteMode: "spread",
            }));
            const evt = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
            document.activeElement?.dispatchEvent(evt);
        }, lines);

        await page.waitForTimeout(500);
        await expect(items.nth(0).locator(".item-text")).toHaveText(/A/);
        await expect(items.nth(1).locator(".item-text")).toHaveText(/B/);
        await expect(items.nth(2).locator(".item-text")).toHaveText(/C/);
    });

    test("シングルカーソルからマルチカーソルへのペースト(full)", async ({ page }) => {
        const items = page.locator(".outliner-item");
        await items.first().locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("one");
        await page.keyboard.press("Enter");
        await page.keyboard.type("two");

        await items.nth(0).locator(".item-text").click({ modifiers: ["Alt"] });
        await items.nth(1).locator(".item-text").click({ modifiers: ["Alt"] });

        const lines = ["X", "Y"];
        await page.evaluate((lines) => {
            const dt = new DataTransfer();
            dt.setData("text/plain", lines.join("\n"));
            dt.setData("application/vscode-editor", JSON.stringify({
                version: 1,
                multicursorText: lines,
                pasteMode: "full",
            }));
            const evt = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
            document.activeElement?.dispatchEvent(evt);
        }, lines);

        await page.waitForTimeout(500);
        const expected = "X\nY";
        await expect(items.nth(0).locator(".item-text")).toHaveText(expected);
        await expect(items.nth(1).locator(".item-text")).toHaveText(expected);
    });
});
