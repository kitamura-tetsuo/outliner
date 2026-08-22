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
    localSelectionEndpoints,
    pointOnSelectionSurface,
    seedVisualNodesAfterFirstItem,
    selectedPlainText,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5026a1b2: dragging onto and off a visual node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        // A bound block renders a whole view: a drag can only reach an endpoint on screen.
        await page.setViewportSize({ width: 1280, height: 1600 });
        await seedSelectionPage(page, testInfo);
    });

    test("a drag from Text onto a Grid takes the Grid whole", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await dragBetweenPoints(
            page,
            await pointForOffset(page, alphaId, 6),
            await pointInVisualNode(page, gridId),
        );

        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "text", itemId: alphaId, offset: 6 },
            end: { kind: "node-boundary", itemId: gridId, side: "after" },
            isReversed: false,
        });
        await expectNodeFragmentCoversBlock(page, gridId);
        expect(await selectedPlainText(page)).toBe("text");
    });

    test("a drag from a Grid onto Text takes the Grid whole", async ({ page }) => {
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await dragBetweenPoints(
            page,
            await pointOnSelectionSurface(page, gridId),
            await pointForOffset(page, omegaId, 5),
        );

        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "node-boundary", itemId: gridId, side: "before" },
            end: { kind: "text", itemId: omegaId, offset: 5 },
            isReversed: false,
        });
        await expectNodeFragmentCoversBlock(page, gridId);
        expect(await selectedPlainText(page)).toBe("Omega");
    });

    test("a reverse drag selects exactly what the forward one does", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await dragBetweenPoints(
            page,
            await pointForOffset(page, alphaId, 6),
            await pointInVisualNode(page, gridId),
        );
        const forward = await localSelectionEndpoints(page);

        // The gesture runs the other way, from the block's outline surface up into the
        // text: a drag may *end* anywhere on a block, but it starts only where the
        // outline owns the surface.
        await dragBetweenPoints(
            page,
            await pointOnSelectionSurface(page, gridId),
            await pointForOffset(page, alphaId, 6),
        );
        const backward = await localSelectionEndpoints(page);

        // Same content, opposite direction: the endpoints are identical and only the
        // anchor/focus flag differs.
        expect(backward?.start).toEqual(forward?.start);
        expect(backward?.end).toEqual(forward?.end);
        expect(forward?.isReversed).toBe(false);
        expect(backward?.isReversed).toBe(true);
        await expectNodeFragmentCoversBlock(page, gridId);
    });

    test("a drag from a Grid to a Calendar takes both blocks", async ({ page }) => {
        const [gridId, calendarId] = await seedVisualNodesAfterFirstItem(page, [
            { type: "yjstable" },
            { type: "calendar" },
        ]);

        await dragBetweenPoints(
            page,
            await pointOnSelectionSurface(page, gridId),
            await pointInVisualNode(page, calendarId),
        );

        expect(await localSelectionEndpoints(page)).toEqual({
            start: { kind: "node-boundary", itemId: gridId, side: "before" },
            end: { kind: "node-boundary", itemId: calendarId, side: "after" },
            isReversed: false,
        });
        await expectNodeFragmentCoversBlock(page, gridId);
        await expectNodeFragmentCoversBlock(page, calendarId);
        // Two textless blocks and nothing else: plain text stays empty (#5024).
        expect(await selectedPlainText(page)).toBe("");
    });
});
