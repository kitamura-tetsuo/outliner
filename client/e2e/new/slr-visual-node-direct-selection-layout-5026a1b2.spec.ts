import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5026a1b2
 *  Title   : Visual nodes are direct targets of outline selection
 *  Source  : docs/client-features/slr-visual-node-direct-selection-5026a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import { pointForOffset, pointInVisualNode } from "../utils/selectionGeometryHelpers";
import {
    dragBetweenPoints,
    expectNodeFragmentCoversBlock,
    fragmentsForItem,
    localSelectionEndpoints,
    seedVisualNodesAfterFirstItem,
    selectVisualNode,
    visualNodeSelectionSurface,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5026a1b2: a directly selected Layout is one container", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        // A Layout holding two blocks is taller than the default viewport.
        await page.setViewportSize({ width: 1280, height: 1600 });
        await seedSelectionPage(page, testInfo);
    });

    test("selecting the Layout draws one rectangle, never one per child block", async ({ page }) => {
        const [layoutId] = await seedVisualNodesAfterFirstItem(page, [
            { type: "layout", children: ["yjstable", "calendar"] },
        ]);
        await expect(page.getByTestId("layout-cell")).toHaveCount(2, { timeout: 20000 });

        await selectVisualNode(page, layoutId);

        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "node-boundary", itemId: layoutId, side: "before" },
            end: { kind: "node-boundary", itemId: layoutId, side: "after" },
            isReversed: false,
        });
        await expectNodeFragmentCoversBlock(page, layoutId);

        // The children the Layout already draws inside that box add nothing of their own.
        const childIds = await page.getByTestId("layout-cell").evaluateAll(cells =>
            cells.map(cell => cell.getAttribute("data-item-id") ?? "")
        );
        expect(childIds).toHaveLength(2);
        for (const childId of childIds) {
            expect(await fragmentsForItem(page, childId)).toEqual([]);
        }
        await expect(page.locator(".editor-overlay .selection[data-selection-kind='node']")).toHaveCount(1);
    });

    test("a drag onto a child block selects the Layout, the row the outline holds", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const [layoutId] = await seedVisualNodesAfterFirstItem(page, [
            { type: "layout", children: ["yjstable"] },
        ]);
        await expect(page.getByTestId("layout-cell")).toHaveCount(1, { timeout: 20000 });

        const childId = await page.getByTestId("layout-cell").first().getAttribute("data-item-id");
        expect(childId).toBeTruthy();

        // Only the container is an outline row, so only it carries a selection surface;
        // a child is part of the Layout's picture.
        await expect(visualNodeSelectionSurface(page, childId!)).toHaveCount(0);
        await expect(visualNodeSelectionSurface(page, layoutId)).toHaveCount(1);

        await dragBetweenPoints(
            page,
            await pointForOffset(page, alphaId, 6),
            await pointInVisualNode(page, childId!),
        );

        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "text", itemId: alphaId, offset: 6 },
            end: { kind: "node-boundary", itemId: layoutId, side: "after" },
            isReversed: false,
        });
        await expect(page.locator(".editor-overlay .selection[data-selection-kind='node']")).toHaveCount(1);
    });
});
