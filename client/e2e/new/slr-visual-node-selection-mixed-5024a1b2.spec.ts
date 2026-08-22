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

test.describe("SLR-5024a1b2: a mixed Text/Grid/Calendar/Text selection", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        // Two stacked blocks are taller than the default viewport, and a drag
        // can only reach an endpoint that is on screen.
        await page.setViewportSize({ width: 1280, height: 1400 });
        await seedSelectionPage(page, testInfo);
    });

    test("draws both blocks as nodes and keeps partial text at both endpoints", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId, calendarId] = await seedVisualNodesAfterFirstItem(page, [
            { type: "yjstable" },
            { type: "calendar" },
        ]);

        // Start inside "Alpha" and stop inside "Omega": neither endpoint item is
        // selected whole, so the text geometry has to stay character-level.
        await dragBetweenTextOffsets(page, { itemId: alphaId, offset: 6 }, { itemId: omegaId, offset: 5 });

        await expectNodeFragmentCoversBlock(page, gridId);
        await expectNodeFragmentCoversBlock(page, calendarId);

        const alphaText = (await page.locator(`[data-item-id="${alphaId}"] .item-text`).boundingBox())!;
        const omegaText = (await page.locator(`[data-item-id="${omegaId}"] .item-text`).boundingBox())!;
        const alphaFragments = await fragmentsForItem(page, alphaId);
        const omegaFragments = await fragmentsForItem(page, omegaId);

        expect(alphaFragments).toHaveLength(1);
        expect(alphaFragments[0].kind).toBe("text");
        // "text" only: the highlight starts inside the item and runs to its end.
        expect(alphaFragments[0].left).toBeGreaterThan(alphaText.x);
        expect(alphaFragments[0].width).toBeLessThan(alphaText.width);

        expect(omegaFragments).toHaveLength(1);
        expect(omegaFragments[0].kind).toBe("text");
        // "Omega" only: the highlight starts at the item's left edge and stops short.
        expect(Math.abs(omegaFragments[0].left - omegaText.x)).toBeLessThanOrEqual(2);
        expect(omegaFragments[0].width).toBeLessThan(omegaText.width);

        // The blocks between the endpoints sit vertically between the two text
        // highlights, in outline order.
        const gridFragment = (await fragmentsForItem(page, gridId))[0];
        const calendarFragment = (await fragmentsForItem(page, calendarId))[0];
        expect(gridFragment.top).toBeGreaterThan(alphaFragments[0].top);
        expect(calendarFragment.top).toBeGreaterThan(gridFragment.top);
        expect(omegaFragments[0].top).toBeGreaterThan(calendarFragment.top);
    });
});
