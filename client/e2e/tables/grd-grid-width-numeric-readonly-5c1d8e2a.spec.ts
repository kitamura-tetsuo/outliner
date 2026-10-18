/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { prepareNumericReadOnlyGrids, setProductionReadOnly, topLevelView } from "../utils/gridNumericReadOnlyFixture";
import { readWidthGridRegistry } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

/*
 * Production read-only origin (issue #5458 REQ-005/REQ-007): the outline host
 * enters read-only mode through its supported production mechanism (the shared
 * metadata reset flag observed by OutlinerBase), and that state must reach the
 * numeric Width controls of both a top-level Grid and a Layout-nested Grid.
 * Width mutation becomes unavailable, a pending draft is discarded on the
 * transition, and saved widths plus history stay unchanged.
 */
test.describe("Grid numeric widths follow the production read-only origin", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await prepareNumericReadOnlyGrids(page, testInfo);
    });

    test("read-only transition disables both placements and preserves state", async ({ page }) => {
        const topView = topLevelView(page);
        const nestedView = page.getByTestId("layout-cell").nth(0).getByTestId("yjs-table-view");
        for (const view of [topView, nestedView]) {
            if (!await view.getByTestId("yjs-table-width-title").isVisible().catch(() => false)) {
                await view.getByTestId("yjs-table-toggle-ui").click();
            }
        }
        const topInput = topView.getByTestId("yjs-table-width-title");
        const nestedInput = nestedView.getByTestId("yjs-table-width-title");
        await expect(topInput).toHaveValue("180", { timeout: 30000 });
        await expect(nestedInput).toHaveValue("200", { timeout: 30000 });
        await expect(topInput).toBeEnabled();
        await expect(nestedInput).toBeEnabled();

        // A pending draft is discarded when the host turns read-only.
        await topInput.fill("240");
        await setProductionReadOnly(page, true);
        await expect(page.locator(".reset-banner")).toBeVisible({ timeout: 10000 });
        await expect(topInput).toBeDisabled({ timeout: 10000 });
        await expect(nestedInput).toBeDisabled();
        await expect(topInput).toHaveValue("180");

        // An attempted commit through the disabled control writes nothing.
        const before = await readWidthGridRegistry(page);
        await topInput.evaluate((el) => {
            const input = el as HTMLInputElement;
            input.value = "999";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            input.blur();
        });
        expect(await readWidthGridRegistry(page)).toEqual(before);
        await expect(topInput).toHaveValue("180");

        // Leaving read-only mode restores editing; the blocked attempt left
        // no history entry, so one Undo reverts the last real width commit.
        await setProductionReadOnly(page, false);
        await expect(page.locator(".reset-banner")).toBeHidden({ timeout: 10000 });
        await expect(topInput).toBeEnabled();
        await expect(nestedInput).toBeEnabled();

        await page.getByTestId("toolbar-undo").click();
        await expect(topInput).toHaveValue("", { timeout: 15000 });
        await expect(nestedInput).toHaveValue("200");
    });
});
