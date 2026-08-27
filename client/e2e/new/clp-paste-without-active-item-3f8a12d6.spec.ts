/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// The paste target used to be the editor store's active item and nothing else,
// and the store keeps that item across navigation. Pasting into another project
// therefore aimed at an item of the page the content was copied from, found
// nothing, and returned in silence — after the Grid tables had already been
// created, leaving them orphaned with nothing on screen.
test.describe("paste with no item of this page active", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("lands at the end of the page instead of disappearing", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Orders", "orders");
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");

        // Stand in for the state a real cross-project copy leaves behind: an
        // active item this page cannot resolve, and no caret anywhere in it.
        await page.evaluate(() => {
            const editor = (globalThis as {
                editorOverlayStore?: { clearSelections: () => void; setActiveItem: (id: string | null) => void; };
            }).editorOverlayStore!;
            editor.clearSelections();
            editor.setActiveItem("item-from-another-page");
        });
        await page.locator("textarea.global-textarea").focus();
        await page.keyboard.press("Control+v");

        // Every copied line arrives — `copyGridHosts` starts one item above the
        // first host, so "Source tail" came with it — and the Grid is rendered
        // rather than left as a table nothing points at.
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(1, { timeout: 60000 });
        const texts = await page.locator(".outliner-item[data-item-id] .item-text").allTextContents();
        expect(texts.join("\n")).toContain("Source tail");
        // The destination's own item is still there: the paste appended.
        expect(texts.join("\n")).toContain("Destination anchor");
    });
});
