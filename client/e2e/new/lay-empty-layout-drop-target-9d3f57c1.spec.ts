import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9d3f57c1
 *  Title   : Visual-block Layout container with 12-column span-based placement
 *  Source  : docs/client-features/lay-visual-block-layout-container-9d3f57c1.yaml
 *
 *  Regression coverage for #5087: the visible empty-Layout drop surface must
 *  itself accept a drop, not just the blank outline row rendered above it.
 */
import { expect, test } from "@playwright/test";
import { dispatchDragAt, layoutChildIds, seedEmptyLayoutAndBlock } from "../utils/layoutDropHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-9d3f57c1: the visible empty-Layout surface itself accepts a drop", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard", "Block target"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("dropping a standalone Grid on the visible empty-state frame inserts it", async ({ page }) => {
        const { layoutId, blockId } = await seedEmptyLayoutAndBlock(page, "yjstable");

        const emptyState = page.getByTestId("layout-empty");
        await expect(emptyState).toBeVisible({ timeout: 15000 });
        const box = (await emptyState.boundingBox())!;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

        // The point under test really is inside the Layout's own rendered
        // surface -- not, say, the outline row rendered above it.
        const hit = await dispatchDragAt(
            page,
            `.outliner-item[data-item-id="${blockId}"] .bullet.drag-handle`,
            point,
        );
        expect(hit.testId).toBe("layout-empty");
        expect(hit.itemId).toBe(layoutId);

        await expect(page.getByTestId("layout-cell")).toHaveCount(1, { timeout: 10000 });
        expect(await layoutChildIds(page, layoutId)).toEqual([blockId]);
    });

    test("dropping a standalone Calendar on the visible empty-state frame inserts it", async ({ page }) => {
        const { layoutId, blockId } = await seedEmptyLayoutAndBlock(page, "calendar");

        const emptyState = page.getByTestId("layout-empty");
        await expect(emptyState).toBeVisible({ timeout: 15000 });
        const box = (await emptyState.boundingBox())!;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

        const hit = await dispatchDragAt(
            page,
            `.outliner-item[data-item-id="${blockId}"] .bullet.drag-handle`,
            point,
        );
        expect(hit.testId).toBe("layout-empty");

        await expect(page.getByTestId("layout-cell")).toHaveCount(1, { timeout: 10000 });
        expect(await layoutChildIds(page, layoutId)).toEqual([blockId]);
    });
});
