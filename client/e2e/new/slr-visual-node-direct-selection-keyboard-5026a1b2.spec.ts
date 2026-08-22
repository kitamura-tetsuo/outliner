import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5026a1b2
 *  Title   : Visual nodes are direct targets of outline selection
 *  Source  : docs/client-features/slr-visual-node-direct-selection-5026a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import {
    expectNodeFragmentCoversBlock,
    fragmentsForItem,
    localCursorItemIds,
    localSelectionEndpoints,
    seedVisualNodesAfterFirstItem,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5026a1b2: Shift+Arrow crosses a visual node atomically", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: 1280, height: 1400 });
        await seedSelectionPage(page, testInfo);
    });

    test("one press takes the whole block, the next steps off it, and Shift+Up gives it back", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await TestHelpers.setCursor(page, alphaId, 0);
        await TestHelpers.ensureCursorReady(page);

        // One press reaches the block's far edge: it is inside the range, whole.
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(400);
        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "text", itemId: alphaId, offset: 0 },
            end: { kind: "node-boundary", itemId: gridId, side: "after" },
            isReversed: false,
        });
        await expectNodeFragmentCoversBlock(page, gridId);

        // The caret never entered the block.
        expect(await localCursorItemIds(page)).not.toContain(gridId);

        // The next press steps off the block onto the following Text row.
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(400);
        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "text", itemId: alphaId, offset: 0 },
            end: { kind: "text", itemId: omegaId, offset: 0 },
            isReversed: false,
        });
        await expectNodeFragmentCoversBlock(page, gridId);

        // Shift+Up puts the range back at the block's near edge, which leaves it out.
        await page.keyboard.press("Shift+ArrowUp");
        await page.waitForTimeout(400);
        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "text", itemId: alphaId, offset: 0 },
            end: { kind: "node-boundary", itemId: gridId, side: "before" },
            isReversed: false,
        });
        expect(await fragmentsForItem(page, gridId)).toHaveLength(0);
        expect(await localCursorItemIds(page)).not.toContain(gridId);
    });

    test("extending upwards across a block takes it whole, with no caret inside it", async ({ page }) => {
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await TestHelpers.setCursor(page, omegaId, 0);
        await TestHelpers.ensureCursorReady(page);

        await page.keyboard.press("Shift+ArrowUp");
        await page.waitForTimeout(400);

        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "node-boundary", itemId: gridId, side: "before" },
            end: { kind: "text", itemId: omegaId, offset: 0 },
            isReversed: true,
        });
        await expectNodeFragmentCoversBlock(page, gridId);
        expect(await localCursorItemIds(page)).not.toContain(gridId);
    });
});
