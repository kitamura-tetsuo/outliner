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

test.describe("SLR-5024a1b2: a Layout is selected as one container", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        // A Layout holding two blocks is taller than the default viewport, and
        // a drag can only reach an endpoint that is on screen.
        await page.setViewportSize({ width: 1280, height: 1400 });
        await seedSelectionPage(page, testInfo);
    });

    test("renders one selection rectangle for the Layout, not one per child block", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [layoutId] = await seedVisualNodesAfterFirstItem(page, [
            { type: "layout", children: ["yjstable", "calendar"] },
        ]);
        await expect(page.getByTestId("layout-cell")).toHaveCount(2, { timeout: 20000 });

        await dragBetweenTextOffsets(page, { itemId: alphaId, offset: 6 }, { itemId: omegaId, offset: 5 });

        // The Layout's own container box is the selected outline node...
        await expectNodeFragmentCoversBlock(page, layoutId);

        // ...and its children, which the Layout already draws inside that box,
        // add no rectangles of their own.
        const childIds = await page.getByTestId("layout-cell").evaluateAll(cells =>
            cells.map(cell => cell.getAttribute("data-item-id") ?? "")
        );
        expect(childIds).toHaveLength(2);
        for (const childId of childIds) {
            expect(await fragmentsForItem(page, childId)).toEqual([]);
        }

        // One block-level highlight in the whole overlay, for the Layout itself.
        const nodeFragments = page.locator(".editor-overlay .selection[data-selection-kind='node']");
        await expect(nodeFragments).toHaveCount(1);
    });
});
