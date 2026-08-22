import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5026a1b2
 *  Title   : Visual nodes are direct targets of outline selection
 *  Source  : docs/client-features/slr-visual-node-direct-selection-5026a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import {
    dragBetweenPoints,
    localSelectionEndpoints,
    seedVisualNodesAfterFirstItem,
} from "../utils/visualNodeSelectionHelpers";
import { seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5026a1b2: a block keeps its own pointer interactions", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: 1280, height: 1400 });
        await seedSelectionPage(page, testInfo);
    });

    test("dragging text inside a Grid's own input stays the Grid's, not the outline's", async ({ page }) => {
        await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        const nameInput = page.getByTestId("yjs-table-name-input").first();
        await expect(nameInput).toBeVisible({ timeout: 20000 });
        await nameInput.fill("Quarterly revenue");

        // A real mouse drag across the input's own text, the gesture that would
        // otherwise start an outline selection drag.
        const box = (await nameInput.boundingBox())!;
        await dragBetweenPoints(
            page,
            { x: box.x + 4, y: box.y + box.height / 2 },
            { x: box.x + box.width - 4, y: box.y + box.height / 2 },
        );

        // The input owns the gesture: its own selection is what moved.
        const selected = await nameInput.evaluate(element => {
            const input = element as HTMLInputElement;
            return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
        });
        expect(selected.length).toBeGreaterThan(0);
        expect("Quarterly revenue").toContain(selected);

        // And the outline made no selection of its own.
        expect(await localSelectionEndpoints(page)).toBeUndefined();
        await expect(page.locator(".editor-overlay .selection")).toHaveCount(0);
    });

    test("pressing a Grid's own button presses it, and selects no outline node", async ({ page }) => {
        await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await page.getByTestId("yjs-table-name-input").first().fill("Quarterly revenue");
        await page.getByTestId("yjs-table-create").first().click();

        // The block acted on its own control: the create panel is gone.
        await expect(page.getByTestId("yjs-table-create-panel")).toHaveCount(0, { timeout: 20000 });
        // No outline selection was made on the way.
        expect(await localSelectionEndpoints(page)).toBeUndefined();
    });
});
