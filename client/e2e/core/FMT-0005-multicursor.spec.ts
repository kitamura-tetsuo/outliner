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
        for (const i of [0, 1, 2]) {
            const locator = await TestHelpers.getItemLocatorByIndex(page, i);
            await locator!.locator(".item-text").click({ modifiers: ["Alt"] });
        }

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
        for (const [i, ch] of ["A", "B", "C"].entries()) {
            const locator = await TestHelpers.getItemLocatorByIndex(page, i);
            await expect(locator!.locator(".item-text")).toHaveText(new RegExp(ch));
        }
    });

    test("シングルカーソルからマルチカーソルへのペースト(full)", async ({ page }) => {
        const items = page.locator(".outliner-item");
        await items.first().locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("one");
        await page.keyboard.press("Enter");
        await page.keyboard.type("two");

        for (const i of [0, 1]) {
            const locator = await TestHelpers.getItemLocatorByIndex(page, i);
            await locator!.locator(".item-text").click({ modifiers: ["Alt"] });
        }

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
        for (const i of [0, 1]) {
            const locator = await TestHelpers.getItemLocatorByIndex(page, i);
            await expect(locator!.locator(".item-text")).toHaveText(expected);
        }
    });
});
