import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5026a1b2
 *  Title   : Visual nodes are direct targets of outline selection
 *  Source  : docs/client-features/slr-visual-node-direct-selection-5026a1b2.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    seedVisualNodesAfterFirstItem,
    selectVisualNode,
    waitForStableGeometry,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

/** What the editor mirrors onto the page for tests when it writes the clipboard. */
async function copiedByEditor(page: Page) {
    return await page.evaluate(() => {
        const mirrored = globalThis as unknown as {
            lastCopiedStructuredItems?: string | { encoded: string; };
            lastCopiedText?: string;
        };
        const structured = mirrored.lastCopiedStructuredItems;
        const encoded = typeof structured === "string" ? structured : structured?.encoded;
        return {
            items: encoded
                ? (JSON.parse(encoded) as {
                    items: Array<{
                        text: string;
                        componentType?: string;
                        yjsTableId?: string;
                        calendarId?: string;
                    }>;
                }).items
                : [],
            plainText: mirrored.lastCopiedText ?? "",
        };
    });
}

/** Seed a Grid and bind it to a real table, so a copy has a binding to preserve. */
async function seedBoundGrid(page: Page): Promise<string> {
    const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);
    await page.getByTestId("yjs-table-name-input").first().fill("Quarterly revenue");
    await page.getByTestId("yjs-table-create").first().click();
    await expect(page.getByTestId("yjs-table-create-panel")).toHaveCount(0, { timeout: 20000 });
    await waitForStableGeometry(page);
    return gridId;
}

test.describe("SLR-5026a1b2: copying, cutting and deleting a directly selected block", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.setViewportSize({ width: 1280, height: 1400 });
        await seedSelectionPage(page, testInfo);
    });

    test("a copied Grid keeps its binding, and borrows no caption from it", async ({ page }) => {
        const gridId = await seedBoundGrid(page);

        await selectVisualNode(page, gridId);
        await page.keyboard.press("Control+c");
        await page.waitForTimeout(700);

        const copied = await copiedByEditor(page);

        // The structured flavor carries the block and the table it is bound to...
        expect(copied.items).toHaveLength(1);
        expect(copied.items[0].componentType).toBe("yjstable");
        expect(copied.items[0].yjsTableId).toBeTruthy();
        // ...with no outline text of its own (#5015).
        expect(copied.items[0].text).toBe("");
        // The outward plain text is what the Grid's view actually rendered (#5024) - its
        // rows - and never the table's display name standing in as a caption.
        expect(copied.plainText).not.toContain("Quarterly revenue");
    });

    test("a copied textless block writes no plain text at all", async ({ page }) => {
        const [calendarId] = await seedVisualNodesAfterFirstItem(page, [{ type: "calendar" }]);
        await page.getByTestId("calendar-name-input").fill("Team calendar");
        await page.getByTestId("calendar-create").click();
        await expect(page.getByTestId("calendar-create-panel")).toHaveCount(0, { timeout: 20000 });
        await waitForStableGeometry(page);

        await selectVisualNode(page, calendarId);
        await page.keyboard.press("Control+c");
        await page.waitForTimeout(700);

        const copied = await copiedByEditor(page);

        expect(copied.items.map(item => item.componentType)).toEqual(["calendar"]);
        expect(copied.items[0].calendarId).toBeTruthy();
        // No caption, no label, not even a blank line: the outline holds no text here.
        expect(copied.plainText).toBe("");
    });

    test("Delete removes a directly selected Grid through ordinary node deletion", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectVisualNode(page, gridId);
        await page.keyboard.press("Delete");
        await page.waitForTimeout(700);

        await expect(page.locator(`[data-visual-node-root="${gridId}"]`)).toHaveCount(0);
        await expect(page.locator(`.outliner-item[data-item-id="${gridId}"]`)).toHaveCount(0);

        // Its neighbours are untouched: only the selected node was removed.
        await expect(page.locator(`.outliner-item[data-item-id="${alphaId}"]`)).toHaveCount(1);
        await expect(page.locator(`.outliner-item[data-item-id="${omegaId}"]`)).toHaveCount(1);
    });

    test("Cut takes the Grid to the clipboard and removes it from the outline", async ({ page }) => {
        const gridId = await seedBoundGrid(page);

        await selectVisualNode(page, gridId);
        await page.keyboard.press("Control+x");
        await page.waitForTimeout(900);

        const copied = await copiedByEditor(page);
        expect(copied.items.map(item => item.componentType)).toEqual(["yjstable"]);
        expect(copied.items[0].yjsTableId).toBeTruthy();

        await expect(page.locator(`[data-visual-node-root="${gridId}"]`)).toHaveCount(0);
    });
});
