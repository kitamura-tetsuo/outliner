import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-b6ebf516 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

async function pasteAt(
    page: import("@playwright/test").Page,
    context: import("@playwright/test").BrowserContext,
    itemId: string,
    offset: number,
    text: string,
) {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await TestHelpers.setCursor(page, itemId, offset, "local");
    await page.locator(`[data-item-id="${itemId}"] .item-content`).click();
    await TestHelpers.setCursor(page, itemId, offset, "local");
    await page.evaluate(async clipboardText => navigator.clipboard.writeText(clipboardText), text);
    await page.keyboard.press("Control+v");
}

async function visibleTexts(page: import("@playwright/test").Page) {
    return page.locator(".outliner-item .item-text").allTextContents();
}

test.describe("multi-line clipboard paste at a caret", () => {
    test("splices every line at a middle caret and undo restores the item", async ({ page, context }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Hello World"]);
        await TestHelpers.waitForItemCount(page, 2);
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(itemId).not.toBeNull();

        await pasteAt(page, context, itemId!, 6, "A\nB\nC");
        await expect.poll(() => visibleTexts(page)).toEqual([expect.any(String), "Hello A", "B", "CWorld"]);
        await expect.poll(() =>
            page.evaluate(() => {
                const cursor = (globalThis as any).editorOverlayStore?.getLocalCursorInstances()?.find((value: any) =>
                    value.isActive
                );
                return cursor && { itemId: cursor.itemId, offset: cursor.offset };
            })
        ).toEqual({ itemId: await TestHelpers.getItemIdByIndex(page, 3), offset: 1 });

        await page.keyboard.press("Control+z");
        await expect.poll(() => visibleTexts(page)).toEqual([expect.any(String), "Hello World"]);
    });

    test("keeps pasted lines beside a nested collapsed target", async ({ page, context }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Parent", "Hello World", "Hidden child", "After"]);
        await TestHelpers.waitForItemCount(page, 5);
        const targetId = await TestHelpers.getItemIdByIndex(page, 2);
        const childId = await TestHelpers.getItemIdByIndex(page, 3);
        expect(targetId).not.toBeNull();
        expect(childId).not.toBeNull();

        await page.locator(`[data-item-id="${targetId}"] .item-content`).click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(200);
        await expect(page.locator(`[data-item-id="${targetId}"]`)).toHaveAttribute("aria-level", "3");
        await page.locator(`[data-item-id="${childId}"] .item-content`).click({ force: true });
        await expect(page.locator("textarea.global-textarea:focus")).toBeVisible();
        await page.keyboard.press("Tab");
        await page.waitForTimeout(200);
        const target = page.locator(`[data-item-id="${targetId}"]`);
        await expect(target).toHaveAttribute("aria-expanded", "true");
        await target.locator("button.collapse-btn").click();
        await expect(target).toHaveAttribute("aria-expanded", "false");

        await pasteAt(page, context, targetId!, 6, "A\nB\nC");
        await expect.poll(() => visibleTexts(page)).toEqual([
            expect.any(String),
            "Parent",
            "Hello A",
            "B",
            "CWorld",
            "After",
        ]);
        const levels = await page.locator(".outliner-item").evaluateAll(items =>
            items.map(item => item.getAttribute("aria-level"))
        );
        expect(levels.slice(2, 5)).toEqual([levels[2], levels[2], levels[2]]);
        expect(levels[2]).not.toBe(levels[1]);
    });
});
