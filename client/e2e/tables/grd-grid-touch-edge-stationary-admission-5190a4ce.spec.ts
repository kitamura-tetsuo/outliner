/** @feature GRD-5190a4ce */
import { devices, expect, test } from "@playwright/test";
import { createOverflowingTouchGrid, enterTouchRangeMode } from "../utils/gridTouchEdgeHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";
registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

test("an in-band handle press advances without any pointer movement", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Touch Grid Stationary Admission"]);
    await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10_000 });
    const grid = await createOverflowingTouchGrid(page);
    const title = grid.locator('tbody tr:first-child td[data-col="title"]');
    await enterTouchRangeMode(page, title);

    const handle = grid.getByRole("button", { name: "Resize selection from end" });
    const point = await TouchGestures.hittablePoint(handle);
    const geometry = await grid.evaluate((node: HTMLElement) => {
        const rect = node.getBoundingClientRect();
        return {
            right: rect.left + node.clientWidth,
            remaining: node.scrollWidth - node.clientWidth - node.scrollLeft,
        };
    });
    expect(point.x).toBeGreaterThan(geometry.right - 32);
    expect(point.x).toBeLessThanOrEqual(geometry.right);
    expect(geometry.remaining).toBeGreaterThan(500);

    await TouchGestures.pressAndHold(page, point, async () => {
        const initial = await grid.evaluate((node: HTMLElement) => node.scrollLeft);
        await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(initial);
        const first = await grid.evaluate((node: HTMLElement) => node.scrollLeft);
        await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(first);
        await expect(grid.locator('td[data-col="done"].grid-selected')).toBeVisible();
        await expect(title).toHaveClass(/grid-selected/);
    });
});
