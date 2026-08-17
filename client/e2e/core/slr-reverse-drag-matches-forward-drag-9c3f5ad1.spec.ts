import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-9c3f5ad1
 *  Title   : Reverse drag selection matches forward drag
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import {
    dragBetween,
    pointForOffset,
    selectedText,
    selectionEndpoints,
    selectionFragmentBoxes,
} from "../utils/selectionGeometryHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-9c3f5ad1: Reverse drag selection matches forward drag", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "First item of the reverse drag scenario",
            "Second item stays fully selected",
            "Third item of the reverse drag scenario",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 4, 10000);
    });

    test("Bottom-to-top drag highlights the same area and copies the same text", async ({ page }) => {
        const firstId = (await TestHelpers.getItemIdByIndex(page, 1))!;
        const lastId = (await TestHelpers.getItemIdByIndex(page, 3))!;

        // Both endpoints sit mid-text, so the first and last items are only partially selected
        const upper = await pointForOffset(page, firstId, 6);
        const lower = await pointForOffset(page, lastId, 10);

        await dragBetween(page, upper, lower);
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();
        const forwardGeometry = await selectionFragmentBoxes(page);
        const forwardText = await selectedText(page);
        await page.keyboard.press("Control+c");
        const forwardClipboard = await page.evaluate(() => navigator.clipboard.readText());

        // The first and last item must really be partially covered: that is where the
        // direction-dependent offset branching used to invert the highlighted interval.
        const forwardOffsets = await selectionEndpoints(page);
        expect(forwardOffsets.startItemId).toBe(firstId);
        expect(forwardOffsets.endItemId).toBe(lastId);
        expect(forwardOffsets.startOffset).toBeGreaterThan(0);
        expect(forwardOffsets.startOffset).toBeLessThan(forwardOffsets.startTextLength);
        expect(forwardOffsets.endOffset).toBeGreaterThan(0);
        expect(forwardOffsets.endOffset).toBeLessThan(forwardOffsets.endTextLength);
        expect(forwardText).toContain("Second item stays fully selected");

        // Same logical range, dragged bottom-to-top
        await dragBetween(page, lower, upper);
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();
        const reverseGeometry = await selectionFragmentBoxes(page);
        const reverseText = await selectedText(page);
        await page.keyboard.press("Control+c");
        const reverseClipboard = await page.evaluate(() => navigator.clipboard.readText());

        expect(reverseText).toBe(forwardText);
        expect(reverseClipboard).toBe(forwardClipboard);
        expect(reverseGeometry).toEqual(forwardGeometry);

        // The direction itself is still recorded, it just does not move the highlight
        expect((await selectionEndpoints(page)).isReversed).toBe(true);
    });
});
