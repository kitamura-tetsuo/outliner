import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5024a1b2
 *  Title   : Visual nodes render inside an outline selection range
 *  Source  : docs/client-features/slr-visual-nodes-in-selection-5024a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import { seedVisualNodesAfterFirstItem } from "../utils/visualNodeSelectionHelpers";
import { seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5024a1b2: a block keeps its own selections", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await seedSelectionPage(page, testInfo);
    });

    test("selecting text inside a Grid's own input draws no outline selection", async ({ page }) => {
        await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        // A block's own inputs own their text selection: the outline overlay
        // must not turn one into an item selection of its own.
        const nameInput = page.getByTestId("yjs-table-name-input").first();
        await expect(nameInput).toBeVisible({ timeout: 20000 });
        await nameInput.fill("Quarterly revenue");
        await nameInput.selectText();
        await page.waitForTimeout(300);

        const selected = await nameInput.evaluate(element => {
            const input = element as HTMLInputElement;
            return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
        });
        expect(selected).toBe("Quarterly revenue");

        // Nothing of the outline is selected, and nothing is drawn over it.
        await expect(page.locator(".editor-overlay .selection")).toHaveCount(0);
        const outlineSelections = await page.evaluate(() =>
            Object.keys(
                (globalThis as unknown as { editorOverlayStore: { selections: Record<string, unknown>; }; })
                    .editorOverlayStore.selections,
            ).length
        );
        expect(outlineSelections).toBe(0);
    });
});
