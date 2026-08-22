import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5026a1b2
 *  Title   : Visual nodes are direct targets of outline selection
 *  Source  : docs/client-features/slr-visual-node-direct-selection-5026a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import {
    expectNodeFragmentCoversBlock,
    fragmentsForItem,
    localCursorItemIds,
    localSelectionEndpoints,
    seedVisualNodesAfterFirstItem,
    selectedPlainText,
    selectVisualNode,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5026a1b2: a visual node is selected directly, as one atomic item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: 1280, height: 1400 });
        await seedSelectionPage(page, testInfo);
    });

    test("pressing a Grid's outline surface selects exactly that Grid", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectVisualNode(page, gridId);

        // before(node) -> after(node): the range no text position could express.
        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "node-boundary", itemId: gridId, side: "before" },
            end: { kind: "node-boundary", itemId: gridId, side: "after" },
            isReversed: false,
        });

        await expectNodeFragmentCoversBlock(page, gridId);
        expect(await fragmentsForItem(page, alphaId)).toHaveLength(0);
        expect(await fragmentsForItem(page, omegaId)).toHaveLength(0);

        // A textless block contributes no plain text - no invented label, no blank line.
        expect(await selectedPlainText(page)).toBe("");
    });

    test("pressing a Calendar's outline surface selects exactly that Calendar", async ({ page }) => {
        const [calendarId] = await seedVisualNodesAfterFirstItem(page, [{ type: "calendar" }]);

        await selectVisualNode(page, calendarId);

        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "node-boundary", itemId: calendarId, side: "before" },
            end: { kind: "node-boundary", itemId: calendarId, side: "after" },
            isReversed: false,
        });
        await expectNodeFragmentCoversBlock(page, calendarId);
    });

    test("a selected block holds no caret, and none is drawn over it", async ({ page }) => {
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectVisualNode(page, gridId);

        // The caret keeps a home on a Text row so Delete and Cut still reach the
        // outline, but it never enters the block.
        const cursorItems = await localCursorItemIds(page);
        expect(cursorItems.length).toBeGreaterThan(0);
        expect(cursorItems).not.toContain(gridId);
        for (const cursorItemId of cursorItems) {
            await expect(page.locator(`.outliner-item[data-item-id="${cursorItemId}"]`).first())
                .toHaveAttribute("data-text-editable", "true");
        }

        // Nor does the block gain a text-editing surface of its own (#5015).
        await expect(page.locator(`.outliner-item[data-item-id="${gridId}"]`))
            .toHaveAttribute("data-text-editable", "false");
    });

    test("Shift-clicking a Grid extends an existing text selection onto it", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await page.locator(`[data-item-id="${alphaId}"] .item-text`).click();
        await page.waitForTimeout(300);
        await selectVisualNode(page, gridId, ["Shift"]);

        const endpoints = await localSelectionEndpoints(page);
        expect(endpoints?.start.kind).toBe("text");
        expect(endpoints?.start.itemId).toBe(alphaId);
        // The far edge: the Grid is inside the range, not merely reached.
        expect(endpoints?.end).toEqual({ kind: "node-boundary", itemId: gridId, side: "after" });
        await expectNodeFragmentCoversBlock(page, gridId);
    });
});
