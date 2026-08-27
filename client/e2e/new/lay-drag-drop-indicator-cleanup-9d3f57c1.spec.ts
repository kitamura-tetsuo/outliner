import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9d3f57c1
 *  Title   : Visual-block Layout container with 12-column span-based placement
 *  Source  : docs/client-features/lay-visual-block-layout-container-9d3f57c1.yaml
 *
 *  Regression coverage for #5123: unlike the outline, LayoutBlock previously
 *  had no global drag-session safety net at all — its `dropTargetChildId` /
 *  `draggingChildId` cleared only from its own local `drop`/`dragend`
 *  handlers, which a DOM reparent mid-move can prevent from ever running.
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

async function seedLayoutWithTwoChildren(
    page: Page,
): Promise<{ layoutId: string; firstId: string; secondId: string; }> {
    return page.evaluate(() => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        const first = layout.items.addNode("e2e");
        first.componentType = "yjstable";
        first.columnSpan = 6;
        const second = layout.items.addNode("e2e");
        second.componentType = "calendar";
        second.columnSpan = 6;
        return { layoutId: layout.id, firstId: first.id, secondId: second.id };
    });
}

async function seedLayoutWithStandaloneBlock(
    page: Page,
): Promise<{ layoutId: string; childId: string; blockId: string; }> {
    return page.evaluate(() => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        const child = layout.items.addNode("e2e");
        child.componentType = "yjstable";
        child.columnSpan = 6;
        const block = items.at(1);
        block.componentType = "yjstable";
        return { layoutId: layout.id, childId: child.id, blockId: block.id };
    });
}

const noIndicators = async (page: Page) => {
    await expect(page.locator(".layout-cell.dragging")).toHaveCount(0);
    await expect(page.locator(".layout-cell.drop-before")).toHaveCount(0);
    await expect(page.locator(".layout-cell.drop-after")).toHaveCount(0);
};

test.describe("FTR-9d3f57c1: Layout drag/drop feedback is cleared on every terminal path", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard", "Standalone block"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("reordering within a Layout clears the indicator from the drop alone, no dragend needed", async ({ page }) => {
        const { secondId } = await seedLayoutWithTwoChildren(page);
        await expect(page.getByTestId("layout-cell")).toHaveCount(2, { timeout: 15000 });

        await page.evaluate(({ secondId }) => {
            const handle = document.querySelector<HTMLElement>(".layout-cell-handle")!;
            const target = document.querySelector<HTMLElement>(`.layout-cell[data-item-id="${secondId}"]`)!;
            const dataTransfer = new DataTransfer();
            const rect = target.getBoundingClientRect();
            const point = { clientX: rect.right - 1, clientY: rect.top + rect.height / 2 };
            handle.dispatchEvent(
                new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(
                new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer, ...point }));
            // Deliberately no dragend: a completed reorder can remount the cells
            // before the browser dispatches it.
        }, { secondId });

        await noIndicators(page);
        expect(await page.getByTestId("layout-cell").count()).toBe(2);
    });

    test("moving a standalone block into a Layout clears the indicator from the drop alone", async ({ page }) => {
        const { blockId } = await seedLayoutWithStandaloneBlock(page);
        await expect(page.getByTestId("layout-cell")).toHaveCount(1, { timeout: 15000 });

        await page.evaluate(({ blockId }) => {
            const handle = document.querySelector<HTMLElement>(`[data-item-id="${blockId}"] .drag-handle`)!;
            const target = document.querySelector<HTMLElement>('[data-testid="layout-grid"]')!;
            const dataTransfer = new DataTransfer();
            dataTransfer.setData("application/x-outliner-item", blockId);
            const rect = target.getBoundingClientRect();
            const point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
            handle.dispatchEvent(
                new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(
                new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer, ...point }));
        }, { blockId });

        await noIndicators(page);
        // The move genuinely happened: the standalone block joined the Layout.
        await expect(page.getByTestId("layout-cell")).toHaveCount(2, { timeout: 10000 });
    });

    test("a cancelled reorder (dragend without drop) leaves no stale indicator", async ({ page }) => {
        const { secondId } = await seedLayoutWithTwoChildren(page);
        await expect(page.getByTestId("layout-cell")).toHaveCount(2, { timeout: 15000 });

        await page.evaluate(({ secondId }) => {
            const handle = document.querySelector<HTMLElement>(".layout-cell-handle")!;
            const target = document.querySelector<HTMLElement>(`.layout-cell[data-item-id="${secondId}"]`)!;
            const dataTransfer = new DataTransfer();
            const rect = target.getBoundingClientRect();
            const point = { clientX: rect.right - 1, clientY: rect.top + rect.height / 2 };
            handle.dispatchEvent(
                new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(
                new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer, ...point }));
        }, { secondId });

        await noIndicators(page);
    });
});
