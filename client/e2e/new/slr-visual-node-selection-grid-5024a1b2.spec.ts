import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5024a1b2
 *  Title   : Visual nodes render inside an outline selection range
 *  Source  : docs/client-features/slr-visual-nodes-in-selection-5024a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import {
    dragBetweenTextOffsets,
    expectNodeFragmentCoversBlock,
    fragmentsForItem,
    seedVisualNodesAfterFirstItem,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5024a1b2: a Grid between the endpoints is selected as a node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await seedSelectionPage(page, testInfo);
    });

    test("a text-to-text drag across a Grid renders the Grid as a selected node", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await dragBetweenTextOffsets(page, { itemId: alphaId, offset: 6 }, { itemId: omegaId, offset: 5 });

        // The Grid owns no text, so it is drawn from its own block geometry.
        await expectNodeFragmentCoversBlock(page, gridId);

        // Both endpoints keep character-level geometry: partial, not whole-item.
        const alphaText = (await page.locator(`[data-item-id="${alphaId}"] .item-text`).boundingBox())!;
        const alphaFragments = await fragmentsForItem(page, alphaId);
        expect(alphaFragments.length).toBeGreaterThan(0);
        expect(alphaFragments.every(fragment => fragment.kind === "text")).toBe(true);
        expect(alphaFragments[0].width).toBeLessThan(alphaText.width);

        const omegaFragments = await fragmentsForItem(page, omegaId);
        expect(omegaFragments.length).toBeGreaterThan(0);
        expect(omegaFragments.every(fragment => fragment.kind === "text")).toBe(true);
    });

    test("the node highlight tints the block instead of covering it", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await dragBetweenTextOffsets(page, { itemId: alphaId, offset: 6 }, { itemId: omegaId, offset: 5 });

        const fragment = page.locator(`.editor-overlay .selection[data-selection-item-id="${gridId}"]`);
        await expect(fragment).toBeVisible();

        const style = await fragment.evaluate(element => {
            const computed = getComputedStyle(element);
            return {
                background: computed.backgroundColor,
                borderWidth: parseFloat(computed.borderTopWidth),
                borderColor: computed.borderTopColor,
            };
        });

        // A readable block keeps showing through: the fill stays a tint...
        const alpha = Number(style.background.match(/rgba?\([^)]*?,\s*([\d.]+)\)$/)?.[1] ?? "1");
        expect(alpha).toBeLessThanOrEqual(0.2);
        // ...while the edge makes the selection unmistakable.
        expect(style.borderWidth).toBeGreaterThanOrEqual(1);
        expect(style.borderColor).not.toBe("rgba(0, 0, 0, 0)");
    });
});
