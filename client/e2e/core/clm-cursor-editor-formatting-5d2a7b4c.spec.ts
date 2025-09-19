/** @feature CLM-5d2a7b4c
 *  Title   : Cursor formatting delegates to CursorEditor
 *  Source  : docs/client-features.yaml
 */
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

const USER_ID = "local";

type FormattingMethod = "formatBold" | "formatItalic" | "formatCode" | "deleteSelection";

type CursorAction = "insertText";

async function performCursorAction(page: Page, itemId: string, action: CursorAction, value: string) {
    await page.evaluate(({ itemId, userId, value }) => {
        const overlayStore = (window as any).editorOverlayStore;
        const getCursorInstances = overlayStore?.getCursorInstances?.bind(overlayStore);
        if (!getCursorInstances) throw new Error("cursor instances unavailable");
        const cursor = getCursorInstances().find((c: any) => c.itemId === itemId && c.userId === userId);
        if (!cursor) throw new Error(`Cursor not found for item ${itemId}`);
        cursor.offset = 0;
        cursor.insertText(value);
    }, { itemId, userId: USER_ID, value });
}

async function setSelectionRange(page: Page, itemId: string, startOffset: number, endOffset: number) {
    await page.evaluate(({ itemId, startOffset, endOffset, userId }) => {
        const overlayStore = (window as any).editorOverlayStore;
        overlayStore.clearSelectionForUser(userId);
        overlayStore.setSelection({
            startItemId: itemId,
            startOffset,
            endItemId: itemId,
            endOffset,
            userId,
            isReversed: false,
        });
    }, { itemId, startOffset, endOffset, userId: USER_ID });
    await page.waitForTimeout(150);
}

async function callFormatting(page: Page, itemId: string, method: FormattingMethod) {
    await page.evaluate(({ itemId, method, userId }) => {
        const overlayStore = (window as any).editorOverlayStore;
        const getCursorInstances = overlayStore?.getCursorInstances?.bind(overlayStore);
        if (!getCursorInstances) throw new Error("cursor instances unavailable");
        const cursor = getCursorInstances().find((c: any) => c.itemId === itemId && c.userId === userId);
        if (!cursor) throw new Error(`Cursor not found for item ${itemId}`);
        if (typeof cursor[method] !== "function") {
            throw new Error(`Cursor method ${method} is not available`);
        }
        cursor[method]();
    }, { itemId, method, userId: USER_ID });
}

test.describe("CLM-5d2a7b4c: Cursor formatting delegates to CursorEditor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.waitForOutlinerItems(page);
    });

    test("applies Scrapbox formatting via CursorEditor", async ({ page }) => {
        const activeItemId = await TestHelpers.getActiveItemId(page)
            || await TestHelpers.getItemIdByIndex(page, 0);
        expect(activeItemId, "expected an active item").toBeTruthy();
        const itemId = activeItemId!;

        await TestHelpers.setCursor(page, itemId, 0, USER_ID);
        await TestHelpers.waitForCursorVisible(page, 15000);

        const itemLocator = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);

        await performCursorAction(page, itemId, "insertText", "FormatMe");
        await page.waitForTimeout(300);
        await expect(itemLocator).toHaveText("FormatMe");

        await setSelectionRange(page, itemId, 0, "FormatMe".length);
        await callFormatting(page, itemId, "formatBold");
        await page.waitForTimeout(300);
        await expect(itemLocator).toHaveText("[[FormatMe]]");

        await setSelectionRange(page, itemId, 0, "[[FormatMe]]".length);
        await callFormatting(page, itemId, "deleteSelection");
        await page.waitForTimeout(200);
        await expect(itemLocator).toHaveText("");

        await performCursorAction(page, itemId, "insertText", "FormatMe");
        await page.waitForTimeout(300);
        await expect(itemLocator).toHaveText("FormatMe");

        await setSelectionRange(page, itemId, 0, "FormatMe".length);
        await callFormatting(page, itemId, "formatItalic");
        await page.waitForTimeout(300);
        await expect(itemLocator).toHaveText("[/FormatMe]");

        await setSelectionRange(page, itemId, 0, "[/FormatMe]".length);
        await callFormatting(page, itemId, "deleteSelection");
        await page.waitForTimeout(200);
        await expect(itemLocator).toHaveText("");

        await performCursorAction(page, itemId, "insertText", "FormatMe");
        await setSelectionRange(page, itemId, 0, "FormatMe".length);
        await callFormatting(page, itemId, "formatCode");
        await page.waitForTimeout(300);
        await expect(itemLocator).toHaveText("`FormatMe`");
    });
});

import "../utils/registerAfterEachSnapshot";
