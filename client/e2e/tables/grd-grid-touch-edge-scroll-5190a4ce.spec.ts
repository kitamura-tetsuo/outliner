/** @feature GRD-5190a4ce */
import { devices, expect, test } from "@playwright/test";
import { createOverflowingTouchGrid, enterTouchRangeMode } from "../utils/gridTouchEdgeHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";
registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

test.describe("Grid touch handle edge scrolling", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Touch Grid Edge Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10_000 });
    });

    test("a stationary real handle drag advances twice and reaches a hidden column", async ({ page }) => {
        const grid = await createOverflowingTouchGrid(page);
        const titleCell = grid.locator('tbody tr:first-child td[data-col="title"]');
        await enterTouchRangeMode(page, titleCell);

        const handle = grid.getByRole("button", { name: "Resize selection from end" });
        await expect(handle).toBeVisible();
        const handleBox = await handle.boundingBox();
        const gridBox = await grid.boundingBox();
        expect(handleBox).not.toBeNull();
        expect(gridBox).not.toBeNull();
        const start = TouchGestures.pointInBox(handleBox!, 0.5);
        const titleBox = await titleCell.boundingBox();
        expect(titleBox).not.toBeNull();
        const edge = { x: gridBox!.x + gridBox!.width - 2, y: titleBox!.y + titleBox!.height / 2 };
        const offsets: number[] = [];

        await TouchGestures.longPressDragAndHold(page, start, edge, async () => {
            // A mouse is independently "primary" while this touch owns the
            // placement. Its down/up at the other coincident handle must not
            // replace the touch owner or terminate the queued edge loop.
            await page.mouse.move(start.x, start.y);
            await page.mouse.down();
            await page.mouse.up();
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
        await expect(grid.locator('td[data-col="id"].grid-selected')).toHaveCount(0);
    });

    test("the start handle scrolls left, stops in the interior, reverses, and cancels cleanly", async ({ page }) => {
        const grid = await createOverflowingTouchGrid(page);
        const box = await grid.boundingBox();
        expect(box).not.toBeNull();
        await grid.hover();
        await page.mouse.wheel(500, 0);
        await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);

        const done = grid.locator('tbody tr:first-child td[data-col="done"]');
        await expect(done).toBeVisible();
        await enterTouchRangeMode(page, done);
        const doneBox = await done.boundingBox();
        expect(doneBox).not.toBeNull();
        const handle = grid.getByRole("button", { name: "Resize selection from start" });
        const handleBox = await handle.boundingBox();
        expect(handleBox).not.toBeNull();
        const before = await grid.evaluate((node: HTMLElement) => node.scrollLeft);
        const left = { x: box!.x + 2, y: doneBox!.y + doneBox!.height / 2 };
        const middle = { x: box!.x + box!.width / 2, y: left.y };
        const right = { x: box!.x + box!.width - 2, y: left.y };

        await TouchGestures.longPressDragAndHold(
            page,
            TouchGestures.pointInBox(handleBox!, 0.5),
            left,
            async contact => {
                await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeLessThan(before);
                await contact.move(middle);
                await page.waitForTimeout(150);
                const stopped = await grid.evaluate((node: HTMLElement) => node.scrollLeft);
                await page.waitForTimeout(150);
                expect(await grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBe(stopped);
                await contact.move(right);
                await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(stopped);
                await contact.cancel();
                const cancelled = await grid.evaluate((node: HTMLElement) => node.scrollLeft);
                await page.waitForTimeout(100);
                expect(await grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBe(cancelled);
            },
            50,
        );
    });

    test("ordinary touch panning remains native when no handle owns the gesture", async ({ page }) => {
        const grid = await createOverflowingTouchGrid(page);
        const box = await grid.boundingBox();
        expect(box).not.toBeNull();
        const y = box!.y + box!.height / 2;
        await TouchGestures.pan(page, { x: box!.x + box!.width - 30, y }, { x: box!.x + 30, y });
        await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
        await expect(page.getByRole("toolbar", { name: "Grid selection actions" })).toHaveCount(0);
    });
});
