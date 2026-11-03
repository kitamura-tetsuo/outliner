/** @feature GRD-5190a4ce */
import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import { commitWidthsProduction, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";
registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

async function createOverflowingGrid(page: Page): Promise<Locator> {
    await page.locator(".outliner-item").first().click();
    const addDatabase = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
    await expect(addDatabase).toBeVisible({ timeout: 10_000 });
    await addDatabase.click();
    const panel = page.getByTestId("yjs-table-create-panel").first();
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await panel.getByTestId("yjs-table-name-input").fill("TouchEdgeScroll");
    await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
    await panel.getByTestId("yjs-table-create").click();
    const grid = page.getByTestId("yjs-table-grid").first();
    await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 15_000 });
    await commitWidthsProduction(page, await singleGridId(page), { id: 180, title: 300, done: 180 });
    await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollWidth > node.clientWidth)).toBe(true);
    return grid;
}

test.describe("Grid touch handle edge scrolling", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Touch Grid Edge Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10_000 });
    });

    test("a stationary real handle drag advances twice and reaches a hidden column", async ({ page }) => {
        const grid = await createOverflowingGrid(page);
        const titleCell = grid.locator('tbody tr:first-child td[data-col="title"]');
        const titleBox = await titleCell.boundingBox();
        expect(titleBox).not.toBeNull();
        await TouchGestures.longPress(page, TouchGestures.pointInBox(titleBox!, 0.5));

        const handle = grid.getByRole("button", { name: "Resize selection from end" });
        await expect(handle).toBeVisible();
        const handleBox = await handle.boundingBox();
        const gridBox = await grid.boundingBox();
        expect(handleBox).not.toBeNull();
        expect(gridBox).not.toBeNull();
        const start = TouchGestures.pointInBox(handleBox!, 0.5);
        const edge = { x: gridBox!.x + gridBox!.width - 2, y: start.y };
        const offsets: number[] = [];

        await TouchGestures.longPressDragAndHold(page, start, edge, async () => {
            await expect.poll(async () => {
                offsets.push(await grid.evaluate((node: HTMLElement) => node.scrollLeft));
                return offsets.at(-1);
            }).toBeGreaterThan(0);
            const first = offsets.at(-1)!;
            await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(first);
            await expect(grid.locator('td[data-col="done"].grid-selected')).toBeVisible();
        }, 50);

        expect(await grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
        await expect(titleCell).toHaveClass(/grid-selected/);
    });
});
