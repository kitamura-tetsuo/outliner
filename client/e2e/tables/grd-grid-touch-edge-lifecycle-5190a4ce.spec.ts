/** @feature GRD-5190a4ce */
import { devices, expect, test } from "@playwright/test";
import { createOverflowingTouchGrid, enterTouchRangeMode, placeSameGridAgain } from "../utils/gridTouchEdgeHelpers";
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
        const ownerBox = await owner.boundingBox();
        expect(handleBox).not.toBeNull();
        expect(ownerBox).not.toBeNull();

        await TouchGestures.longPressDragAndHold(
            page,
            TouchGestures.pointInBox(handleBox!, 0.5),
            { x: ownerBox!.x + ownerBox!.width - 2, y: cellBox!.y + cellBox!.height / 2 },
            async () => {
                await expect.poll(() => owner.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
                expect(await foreign.evaluate((node: HTMLElement) => node.scrollLeft)).toBe(0);
                await expect(foreign.locator("td.grid-selected")).toHaveCount(0);
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
        const gridBox = await grid.boundingBox();
        expect(handleBox).not.toBeNull();
        expect(gridBox).not.toBeNull();

        await TouchGestures.longPressDragAndHold(
            page,
            TouchGestures.pointInBox(handleBox!, 0.5),
            { x: gridBox!.x + gridBox!.width - 2, y: cellBox!.y + cellBox!.height / 2 },
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
});
