import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-3c7f81ad
 *  Title   : Unified undo stack across scopes
 *  Source  : docs/client-features/und-unified-undo-stack-3c7f81ad.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

/**
 * Redoing a plain text edit must put the characters back into the item's
 * Y.Text, not merely advance the undo bookkeeping. The assertion reads the Yjs
 * tree rather than the DOM so a stale render cannot make the test pass.
 */
test.describe("FTR-3c7f81ad: redo restores an undone text edit", () => {
    test("redo re-applies the typed characters in the Yjs tree", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha"]);

        // The seeded line lives under the page item, so read it through the page's children.
        const seededText = async () => (await TreeValidator.getTreeData(page)).items[0].items[0].text;

        const itemText = page.locator(".outliner-item", { hasText: "Alpha" }).last().locator(".item-text").first();
        await expect(itemText).toBeVisible({ timeout: 10000 });
        await itemText.click();
        await page.waitForTimeout(300);

        await page.keyboard.press("End");
        await page.keyboard.type(" EDITED");
        await expect.poll(seededText, { timeout: 10000 }).toBe("Alpha EDITED");

        await page.keyboard.press("Control+z");
        await expect.poll(seededText, { timeout: 10000 }).toBe("Alpha");

        await page.keyboard.press("Control+Shift+z");
        await expect.poll(seededText, { timeout: 10000 }).toBe("Alpha EDITED");
        await expect(page.locator(".outliner-item", { hasText: "EDITED" }).last()).toContainText("Alpha EDITED");
    });
});
