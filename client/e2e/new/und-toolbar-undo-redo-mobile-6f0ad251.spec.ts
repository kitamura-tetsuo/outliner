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

const ORIGINAL = "Mobile undo source item";
const ADDED = "Mobile undo added item";

/**
 * The debug tree is rooted at the project's pages, so the seeded lines are the
 * children of the first page.
 */
async function itemTexts(page: import("@playwright/test").Page): Promise<string[]> {
    const treeData = await TreeValidator.getTreeData(page);
    return treeData.items[0].items.map((item: { text: string; }) => item.text);
}

/**
 * Phone keyboards have no Ctrl key, so the mobile action toolbar is the only
 * way to reach the history there. Split from the desktop spec to keep each
 * Playwright file short.
 */
test.describe("FTR-6f0ad251: Undo/Redo buttons in the mobile action toolbar", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("undo and redo an outline operation from the mobile toolbar", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [ORIGINAL]);

        await expect(page.getByTestId("mobile-action-toolbar")).toBeVisible({ timeout: 10000 });

        const undoBtn = page.getByTestId("mobile-toolbar-undo");
        const redoBtn = page.getByTestId("mobile-toolbar-redo");
        await expect(undoBtn).toBeVisible();
        await expect(redoBtn).toBeVisible();
        await expect(undoBtn).toBeDisabled();
        await expect(redoBtn).toBeDisabled();

        const itemText = page.locator(".outliner-item").first().locator(".item-text").first();
        await itemText.click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.type(ADDED);
        await expect(async () => {
            expect(await itemTexts(page)).toContain(ADDED);
        }).toPass({ timeout: 10000 });

        await expect(undoBtn).toBeEnabled();

        await undoBtn.click();
        await TreeValidator.waitForProjectReady(page);
        await expect(async () => {
            expect(await itemTexts(page)).toEqual([ORIGINAL]);
        }).toPass({ timeout: 10000 });

        await expect(redoBtn).toBeEnabled();
        await redoBtn.click();
        await expect(async () => {
            expect(await itemTexts(page)).toContain(ADDED);
        }).toPass({ timeout: 10000 });
    });
});
