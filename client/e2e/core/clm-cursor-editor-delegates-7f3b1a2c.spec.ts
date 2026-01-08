import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-7f3b1a2c
 *  Title   : Cursor editing flows through CursorEditor
 *  Source  : docs/client-features.yaml
 */
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

const USER_ID = "local";

async function performCursorAction(
    page: Page,
    itemId: string,
    action: "insertText" | "deleteBackward" | "deleteForward" | "insertLineBreak",
    options: { value?: string; offset?: number; } = {},
): Promise<string | number | void> {
    return page.evaluate(({ itemId, action, options, userId }) => {
        const editorOverlayStore = (window as {
            editorOverlayStore?: {
                getCursorInstances: () => {
                    itemId: string;
                    userId: string;
                    offset: number;
                    applyToStore: () => void;
                    insertText: (text: string) => void;
                    deleteBackward: () => void;
                    deleteForward: () => void;
                    insertLineBreak: () => void;
                }[];
            };
        }).editorOverlayStore;
        const getCursorInstances = editorOverlayStore?.getCursorInstances?.bind(editorOverlayStore);
        if (!getCursorInstances) {
            throw new Error("Cursor instances not available on editorOverlayStore");
        }
        const cursor = getCursorInstances().find((c) => c.itemId === itemId && c.userId === userId);
        if (!cursor) {
            throw new Error(`Cursor not found for itemId=${itemId}`);
        }
        if (typeof options.offset === "number") {
            cursor.offset = options.offset;
            cursor.applyToStore();
        }
        switch (action) {
            case "insertText":
                cursor.insertText(options.value ?? "");
                return cursor.offset;
            case "deleteBackward":
                cursor.deleteBackward();
                return cursor.offset;
            case "deleteForward":
                cursor.deleteForward();
                return cursor.offset;
            case "insertLineBreak":
                cursor.insertLineBreak();
                return cursor.itemId;
            default:
                return undefined;
        }
    }, { itemId, action, options, userId: USER_ID });
}

test.describe("CLM-7f3b1a2c: Cursor editing flows through CursorEditor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.waitForOutlinerItems(page);
    });

    test("delegates editing operations to CursorEditor", async ({ page }) => {
        const activeItemId = await TestHelpers.getActiveItemId(page)
            || await TestHelpers.getItemIdByIndex(page, 0);
        expect(activeItemId, "an active item should be available").toBeTruthy();
        const itemId = activeItemId!;

        await TestHelpers.setCursor(page, itemId, 0, USER_ID);
        await TestHelpers.waitForCursorVisible(page, 15000);

        const itemLocator = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);

        await performCursorAction(page, itemId, "insertText", { value: "CursorFlow" });
        await page.waitForTimeout(300);
        await expect(itemLocator).toContainText("CursorFlow");

        await performCursorAction(page, itemId, "deleteBackward");
        await page.waitForTimeout(300);
        await expect(itemLocator).toContainText("CursorFlo");

        await performCursorAction(page, itemId, "insertText", { value: "w" });
        await page.waitForTimeout(300);
        await expect(itemLocator).toContainText("CursorFlow");

        await performCursorAction(page, itemId, "deleteForward", { offset: 0 });
        await page.waitForTimeout(300);
        await expect(itemLocator).toContainText("ursorFlow");

        await performCursorAction(page, itemId, "insertText", { value: "C", offset: 0 });
        await page.waitForTimeout(300);
        await expect(itemLocator).toContainText("CursorFlow");

        const newItemId = await performCursorAction(page, itemId, "insertLineBreak", { offset: 6 });
        expect(typeof newItemId === "string" && newItemId.length > 0, "insertLineBreak should return new itemId").toBe(
            true,
        );
        await page.waitForTimeout(500);

        await expect(itemLocator).toContainText("Cursor");

        const splitItemLocator = page.locator(`.outliner-item[data-item-id="${newItemId}"] .item-text`);
        await splitItemLocator.waitFor({ state: "visible", timeout: 10000 });
        await expect(splitItemLocator).toContainText("Flow");
    });
});
