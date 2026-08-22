import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5015a1b2
 *  Title   : Immutable outline node kinds with text owned only by Text nodes
 *  Source  : docs/client-features/nod-immutable-outline-node-kinds-5015a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Only Text nodes own ordinary outline text (#5015). A Grid, Calendar or Layout
 * renders no text field at all, so there is nothing to type into and nothing
 * that could act as a caption — not even text a node carried before it became a
 * block in stale development data.
 */
test.describe("FTR-5015a1b2: visual nodes own no outline text", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Upcoming tasks", "block host"]);
        await TestHelpers.waitForOutlinerItems(page, 2);
    });

    /** Stamp the second seeded row as `componentType`, keeping its stale text. */
    async function makeBlock(page: import("@playwright/test").Page, componentType: string) {
        await page.evaluate((type) => {
            const items = (globalThis as any).generalStore.currentPage.items;
            items.at(1).componentType = type;
        }, componentType);
    }

    for (const [kind, componentType] of [["grid", "yjstable"], ["calendar", "calendar"], ["layout", "layout"]]) {
        test(`a ${kind} node renders no editable outline text field`, async ({ page }) => {
            await makeBlock(page, componentType);

            const block = page.locator(`.outliner-item[data-node-kind="${kind}"]`);
            await expect(block).toHaveCount(1, { timeout: 15000 });
            await expect(block).toHaveAttribute("data-text-editable", "false");
            // No text field means no `.item-text` element to click into.
            await expect(block.locator(".item-text")).toHaveCount(0);
            // ...and the stale text it still stores is never shown.
            await expect(block).not.toContainText("block host");
        });
    }

    test("a Text node keeps its editable text and stays text-editable", async ({ page }) => {
        // `.page-title` is the page's own row; the outline's first Text node is
        // the one below it.
        const textNode = page.locator('.outliner-item[data-node-kind="text"]:not(.page-title)').first();
        await expect(textNode).toHaveAttribute("data-text-editable", "true");
        await expect(textNode.locator(".item-text")).toHaveText("Upcoming tasks");
    });

    test("typing on a Grid node creates no hidden item text", async ({ page }) => {
        await makeBlock(page, "yjstable");

        const block = page.locator('.outliner-item[data-node-kind="grid"]');
        await expect(block).toHaveCount(1, { timeout: 15000 });
        const blockId = await block.getAttribute("data-item-id");

        // Read the Y.Text itself throughout, not the `text` getter: the getter
        // masks a visual node's stored value, so it would report "" whether or
        // not a keystroke actually landed.
        const storedText = () =>
            page.evaluate(() => String((globalThis as any).generalStore.currentPage.items.at(1).yMap.get("text")));
        // This row was stamped as a block while it still held seeded text, the
        // stale-data case the model tolerates.
        const before = await storedText();

        // Put the caret on the block the way the slash-command flow leaves it,
        // then type: keystrokes take Item.insertTextAt, not updateText.
        await TestHelpers.setCursor(page, blockId!, 0);
        await TestHelpers.focusGlobalTextarea(page);
        await page.keyboard.type("caption");
        await page.waitForTimeout(500);

        // Not one character of it reached the node.
        expect(await storedText()).toBe(before);
        expect(await storedText()).not.toContain("caption");
        await expect(block).not.toContainText("caption");
    });
});
