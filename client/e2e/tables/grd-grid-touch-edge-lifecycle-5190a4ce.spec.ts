/** @feature GRD-5190a4ce */
import { devices, expect, test } from "@playwright/test";
import {
    createOverflowingTouchGrid,
    enterTouchRangeMode,
    gridClientBox,
    placeSameGridAgain,
} from "../utils/gridTouchEdgeHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";
registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

test.describe("Grid touch edge-scroll ownership and invalidation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Touch Grid Lifecycle Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10_000 });
    });

    test("scroll and selection remain isolated to the initiating placement", async ({ page }) => {
        const owner = await createOverflowingTouchGrid(page);
        const foreign = await placeSameGridAgain(page);
        const cell = owner.locator('tbody tr:first-child td[data-col="title"]');
        await enterTouchRangeMode(page, cell);
        const cellBox = await cell.boundingBox();
        expect(cellBox).not.toBeNull();
        const handleBox = await owner.getByRole("button", { name: "Resize selection from end" }).boundingBox();
        const ownerBox = await gridClientBox(owner);
        const foreignCell = foreign.locator('tbody tr:first-child td[data-col="title"]');
        const foreignCellBox = await foreignCell.boundingBox();
        expect(handleBox).not.toBeNull();
        expect(foreignCellBox).not.toBeNull();

        await TouchGestures.longPressDragAndHold(
            page,
            await TouchGestures.hittablePoint(owner.getByRole("button", { name: "Resize selection from end" })),
            { x: ownerBox.x + ownerBox.width - 2, y: cellBox!.y + cellBox!.height / 2 },
            async contact => {
                await expect.poll(() => owner.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
                expect(await foreign.evaluate((node: HTMLElement) => node.scrollLeft)).toBe(0);
                await expect(foreign.locator("td.grid-selected")).toHaveCount(0);
                const ownerSelection = await owner.locator("td.grid-selected").evaluateAll(cells =>
                    cells.map(cell => (cell as HTMLElement).dataset.col)
                );
                await contact.move(TouchGestures.pointInBox(foreignCellBox!, 0.5));
                await page.waitForTimeout(150);
                expect(await foreign.evaluate((node: HTMLElement) => node.scrollLeft)).toBe(0);
                await expect(foreign.locator("td.grid-selected")).toHaveCount(0);
                expect(
                    await owner.locator("td.grid-selected").evaluateAll(cells =>
                        cells.map(cell => (cell as HTMLElement).dataset.col)
                    ),
                ).toEqual(ownerSelection);
            },
            50,
        );
        expect(await foreign.evaluate((node: HTMLElement) => node.scrollLeft)).toBe(0);
    });

    test("removing the endpoint identity invalidates queued stationary frames", async ({ page }) => {
        const grid = await createOverflowingTouchGrid(page);
        const cell = grid.locator('tbody tr:first-child td[data-col="title"]');
        await enterTouchRangeMode(page, cell);
        const cellBox = await cell.boundingBox();
        expect(cellBox).not.toBeNull();
        const handleBox = await grid.getByRole("button", { name: "Resize selection from end" }).boundingBox();
        const gridBox = await gridClientBox(grid);
        expect(handleBox).not.toBeNull();

        await TouchGestures.longPressDragAndHold(
            page,
            await TouchGestures.hittablePoint(grid.getByRole("button", { name: "Resize selection from end" })),
            { x: gridBox.x + gridBox.width - 2, y: cellBox!.y + cellBox!.height / 2 },
            async () => {
                await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
                await grid.locator("button.delete-row").click();
                const confirm = page.getByRole("dialog").getByRole("button", { name: /delete/i });
                if (await confirm.isVisible().catch(() => false)) await confirm.click();
                await expect(grid.locator("tbody tr")).toHaveCount(0);
                const stopped = await grid.evaluate((node: HTMLElement) => node.scrollLeft);
                await page.waitForTimeout(150);
                expect(await grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBe(stopped);
            },
            50,
        );
    });

    test("a second real touch cannot retarget an owned handle drag", async ({ page }) => {
        const grid = await createOverflowingTouchGrid(page);
        const title = grid.locator('tbody tr:first-child td[data-col="title"]');
        await enterTouchRangeMode(page, title);
        const ownerHandle = grid.getByRole("button", { name: "Resize selection from end" });
        const gridBox = await gridClientBox(grid);
        const titleBox = await title.boundingBox();
        expect(titleBox).not.toBeNull();

        await TouchGestures.longPressDragAndHold(
            page,
            await TouchGestures.hittablePoint(ownerHandle),
            { x: gridBox.x + gridBox.width - 2, y: titleBox!.y + titleBox!.height / 2 },
            async contact => {
                await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
                await contact.move({
                    x: gridBox.x + gridBox.width / 2,
                    y: titleBox!.y + titleBox!.height / 2,
                });
                await page.waitForTimeout(100);
                const otherHandle = grid.getByRole("button", { name: "Resize selection from start" });
                const before = await grid.locator("td.grid-selected").evaluateAll(cells =>
                    cells.map(cell => (cell as HTMLElement).dataset.col)
                );
                await contact.pressAdditional(await TouchGestures.hittablePoint(otherHandle));
                await page.waitForTimeout(TouchGestures.LONG_PRESS_HOLD_MS);
                expect(
                    await grid.locator("td.grid-selected").evaluateAll(cells =>
                        cells.map(cell => (cell as HTMLElement).dataset.col)
                    ),
                ).toEqual(before);
                const offset = await grid.evaluate((node: HTMLElement) => node.scrollLeft);
                await contact.move({
                    x: gridBox.x + gridBox.width - 2,
                    y: titleBox!.y + titleBox!.height / 2,
                });
                await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(offset);
            },
            50,
        );
    });

    test("handle ownership invalidates an earlier ordinary touch timer", async ({ page }) => {
        const grid = await createOverflowingTouchGrid(page);
        const title = grid.locator('tbody tr:first-child td[data-col="title"]');
        await enterTouchRangeMode(page, title);
        const ordinaryCell = grid.locator('tbody tr:first-child td[data-col="id"]');
        const ordinaryBox = await ordinaryCell.boundingBox();
        const gridBox = await gridClientBox(grid);
        expect(ordinaryBox).not.toBeNull();

        const ordinaryPoint = TouchGestures.pointInBox(ordinaryBox!, 0.5);
        await TouchGestures.longPressDragAndHold(
            page,
            ordinaryPoint,
            ordinaryPoint,
            async () => {
                const handle = grid.getByRole("button", { name: "Resize selection from end" });
                const ownerPoint = await TouchGestures.hittablePoint(handle);
                await page.mouse.move(ownerPoint.x, ownerPoint.y);
                await page.mouse.down();
                // Let the owner's first geometry update settle while still
                // observing before the pre-existing 500ms touch timer.
                await page.waitForTimeout(100);
                const selectedBefore = await grid.locator("td.grid-selected").evaluateAll(cells =>
                    cells.map(cell => (cell as HTMLElement).dataset.col)
                );
                const transitions = await grid.evaluate(async (node, holdMs) => {
                    const selectedColumns = () =>
                        Array.from(node.querySelectorAll<HTMLElement>("td.grid-selected"), cell => cell.dataset.col);
                    const observed: Array<Array<string | undefined>> = [];
                    const observer = new MutationObserver(() => observed.push(selectedColumns()));
                    observer.observe(node, { attributes: true, attributeFilter: ["class"], subtree: true });
                    await new Promise(resolve => setTimeout(resolve, holdMs));
                    observer.disconnect();
                    return observed;
                }, TouchGestures.LONG_PRESS_HOLD_MS);
                expect(
                    await grid.locator("td.grid-selected").evaluateAll(cells =>
                        cells.map(cell => (cell as HTMLElement).dataset.col)
                    ),
                ).toEqual(selectedBefore);
                expect(transitions.every(selected => JSON.stringify(selected) === JSON.stringify(selectedBefore))).toBe(
                    true,
                );
                await page.mouse.move(gridBox.x + gridBox.width - 2, ordinaryBox!.y + ordinaryBox!.height / 2);
                await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
                await page.mouse.up();
            },
            50,
        );
    });

    test("removing the owning placement makes queued handle work inert", async ({ page }) => {
        const grid = await createOverflowingTouchGrid(page);
        const cell = grid.locator('tbody tr:first-child td[data-col="title"]');
        await enterTouchRangeMode(page, cell);
        const gridBox = await gridClientBox(grid);
        const cellBox = await cell.boundingBox();
        expect(cellBox).not.toBeNull();

        await TouchGestures.longPressDragAndHold(
            page,
            await TouchGestures.hittablePoint(grid.getByRole("button", { name: "Resize selection from end" })),
            { x: gridBox.x + gridBox.width - 2, y: cellBox!.y + cellBox!.height / 2 },
            async () => {
                await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
                const item = grid.locator("xpath=ancestor::*[contains(@class, 'outliner-item')]").first();
                await item.locator(".item-content").click({ button: "right" });
                const menu = page.locator(".context-menu");
                await expect(menu).toBeVisible();
                await menu.getByRole("menuitem", { name: "Delete item" }).click();
                const dialog = page.getByRole("alertdialog", { name: "Delete Item" });
                await expect(dialog).toBeVisible();
                await dialog.getByRole("button", { name: /delete/i }).click();
                await expect(grid).toHaveCount(0);
                await page.waitForTimeout(150);
                await expect(page.getByTestId("yjs-table-grid")).toHaveCount(0);
            },
            50,
        );
    });
});
