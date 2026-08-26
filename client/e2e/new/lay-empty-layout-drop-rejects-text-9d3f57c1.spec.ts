import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9d3f57c1
 *  Title   : Visual-block Layout container with 12-column span-based placement
 *  Source  : docs/client-features/lay-visual-block-layout-container-9d3f57c1.yaml
 *
 *  Companion to lay-empty-layout-drop-target-9d3f57c1.spec.ts (#5087): the
 *  visible empty-state frame accepting drops must not widen what a Layout
 *  accepts -- an ordinary Text node dropped there is still refused.
 */
import { expect, test } from "@playwright/test";
import { dispatchDragAt, layoutChildIds } from "../utils/layoutDropHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-9d3f57c1: the empty-Layout drop surface still rejects ordinary text", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard", "just some text"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("dropping an ordinary Text item on the visible empty-state frame is rejected", async ({ page }) => {
        // Item 1 is left as a plain Text node (a component type, once stamped,
        // cannot be changed -- see app-schema's kind-write guard).
        const { layoutId, textId } = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const layout = items.at(0);
            layout.componentType = "layout";
            const text = items.at(1);
            return { layoutId: layout.id, textId: text.id };
        });

        const emptyState = page.getByTestId("layout-empty");
        await expect(emptyState).toBeVisible({ timeout: 15000 });
        const box = (await emptyState.boundingBox())!;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

        await dispatchDragAt(page, `.outliner-item[data-item-id="${textId}"] .bullet.drag-handle`, point);

        await page.waitForTimeout(300);
        expect(await layoutChildIds(page, layoutId)).toEqual([]);
        await expect(page.getByTestId("layout-empty")).toBeVisible();
    });
});
