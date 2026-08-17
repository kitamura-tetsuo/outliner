import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-9c3f5ad1
 *  Title   : Reverse drag selection matches forward drag
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { dragBetween, pointForOffset, selectedText } from "../utils/selectionGeometryHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-9c3f5ad1: Reverse drag inside a single item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First item of the reverse drag scenario"]);
        await TestHelpers.waitForOutlinerItems(page, 2, 10000);
    });

    test("Bottom-to-top drag inside one item highlights the dragged characters", async ({ page }) => {
        const itemId = (await TestHelpers.getItemIdByIndex(page, 1))!;
        const left = await pointForOffset(page, itemId, 6);
        const right = await pointForOffset(page, itemId, 16);

        // Dragged right-to-left: the highlight must cover the dragged characters,
        // not the complement of them
        await dragBetween(page, right, left);

        const fragments = page.locator(`.editor-overlay .selection[data-selection-item-id="${itemId}"]`);
        await expect(fragments).toHaveCount(1);

        const box = (await fragments.first().boundingBox())!;
        expect(Math.abs(box.x - (left.x - 1))).toBeLessThanOrEqual(2);
        expect(Math.abs((box.x + box.width) - (right.x - 1))).toBeLessThanOrEqual(2);

        // The same characters the geometry covers are the ones the editor reports as selected
        expect(await selectedText(page)).toBe("item of th");
    });
});
