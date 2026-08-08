import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-6f0ad251
 *  Title   : Undo / Redo buttons in the toolbars
 *  Source  : docs/client-features/und-toolbar-undo-redo-6f0ad251.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

const ORIGINAL = "Toolbar undo source item";
const SUFFIX = " EDITED";
const ADDED = "Toolbar redo added item";

/**
 * The debug tree is rooted at the project's pages, so the seeded lines are the
 * children of the first page.
 */
async function itemTexts(page: import("@playwright/test").Page): Promise<string[]> {
    const treeData = await TreeValidator.getTreeData(page);
    return treeData.items[0].items.map((item: { text: string; }) => item.text);
}

/**
 * The toolbar buttons must be exactly equivalent to Ctrl+Z / Ctrl+Shift+Z: they
 * drive the same global undo router, so the assertions here read the Yjs tree
 * rather than the rendered text.
 */
test.describe("FTR-6f0ad251: Undo/Redo buttons in the main toolbar", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [ORIGINAL]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("undo reverses the last edit, and both buttons track the history", async ({ page }) => {
        test.setTimeout(120000);

        const undoBtn = page.getByTestId("toolbar-undo");
        const redoBtn = page.getByTestId("toolbar-redo");

        // Nothing has happened yet, so both stacks are empty.
        await expect(undoBtn).toBeDisabled();
        await expect(redoBtn).toBeDisabled();

        const itemText = page.locator(".outliner-item").first().locator(".item-text").first();
        await itemText.click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.type(SUFFIX);
        await expect(page.locator(".outliner-item").first()).toContainText(SUFFIX, { timeout: 10000 });

        // An operation is recorded: Undo becomes available, Redo stays empty.
        await expect(undoBtn).toBeEnabled();
        await expect(redoBtn).toBeDisabled();

        await undoBtn.click();
        await TreeValidator.waitForProjectReady(page);
        await expect(async () => {
            expect(await itemTexts(page)).toEqual([ORIGINAL]);
        }).toPass({ timeout: 10000 });

        // The operation moved to the redo side.
        await expect(redoBtn).toBeEnabled();
        await expect(undoBtn).toBeDisabled();
    });

    test("redo restores an item that undo removed", async ({ page }) => {
        test.setTimeout(120000);

        const undoBtn = page.getByTestId("toolbar-undo");
        const redoBtn = page.getByTestId("toolbar-redo");

        const itemText = page.locator(".outliner-item").first().locator(".item-text").first();
        await itemText.click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.type(ADDED);
        await expect(async () => {
            expect(await itemTexts(page)).toContain(ADDED);
        }).toPass({ timeout: 10000 });

        // Creating the item and typing its text happened inside one capture
        // window, so they form a single operation and one undo removes both.
        await undoBtn.click();
        await expect(async () => {
            expect(await itemTexts(page)).toEqual([ORIGINAL]);
        }).toPass({ timeout: 10000 });

        await expect(redoBtn).toBeEnabled();
        await redoBtn.click();
        await expect(async () => {
            expect(await itemTexts(page)).toContain(ADDED);
        }).toPass({ timeout: 10000 });
    });

    test("clicking undo keeps the caret in the editor", async ({ page }) => {
        test.setTimeout(120000);

        const itemText = page.locator(".outliner-item").first().locator(".item-text").first();
        await itemText.click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.type(SUFFIX);
        await expect(page.locator(".outliner-item").first()).toContainText(SUFFIX, { timeout: 10000 });

        await page.getByTestId("toolbar-undo").click();

        // The global textarea keeps focus, so typing continues to reach the item
        // instead of being swallowed by the button.
        await expect(page.locator("textarea.global-textarea")).toBeFocused({ timeout: 10000 });
    });
});
