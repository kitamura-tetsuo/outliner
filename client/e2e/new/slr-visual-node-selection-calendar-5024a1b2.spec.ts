import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5024a1b2
 *  Title   : Visual nodes render inside an outline selection range
 *  Source  : docs/client-features/slr-visual-nodes-in-selection-5024a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import { selectionFragmentBoxes } from "../utils/selectionGeometryHelpers";
import {
    dragBetweenTextOffsets,
    expectNodeFragmentCoversBlock,
    seedVisualNodesAfterFirstItem,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5024a1b2: a Calendar between the endpoints is selected as a node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await seedSelectionPage(page, testInfo);
    });

    test("a text-to-text drag across a Calendar renders the Calendar as a selected node", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [calendarId] = await seedVisualNodesAfterFirstItem(page, [{ type: "calendar" }]);

        await dragBetweenTextOffsets(page, { itemId: alphaId, offset: 6 }, { itemId: omegaId, offset: 5 });

        await expectNodeFragmentCoversBlock(page, calendarId);
    });

    test("a reverse drag produces the same node and text geometry", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        await seedVisualNodesAfterFirstItem(page, [{ type: "calendar" }]);

        const alpha = { itemId: alphaId, offset: 6 };
        const omega = { itemId: omegaId, offset: 5 };

        await dragBetweenTextOffsets(page, alpha, omega);
        const forward = await selectionFragmentBoxes(page);

        // Clear the selection, then draw the same range the other way round.
        await page.locator(`[data-item-id="${omegaId}"] .item-text`).click();
        await page.waitForTimeout(300);
        await dragBetweenTextOffsets(page, omega, alpha);
        const reverse = await selectionFragmentBoxes(page);

        expect(forward.length).toBeGreaterThan(0);
        // Which characters and which blocks are highlighted follows document
        // order, not the direction the drag was made in.
        expect(reverse).toEqual(forward);
    });
});
