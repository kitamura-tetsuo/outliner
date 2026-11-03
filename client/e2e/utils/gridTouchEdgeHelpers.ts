import { expect, type Locator, type Page } from "@playwright/test";
import { commitWidthsProduction, singleGridId } from "./gridWidthHelpers";
import { TouchGestures } from "./touchGestures";

export async function createOverflowingTouchGrid(page: Page): Promise<Locator> {
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
    await page.getByTestId("yjs-table-add-row").first().click();
    await expect(grid.locator("tbody tr")).toHaveCount(1, { timeout: 10_000 });
    // Leave enough real overflow for separate frame observations. With only a
    // few hundred overflow pixels, the 12px animation loop can reach the
    // physical bound before Playwright's first polling interval and obscure
    // whether stationary scrolling advanced more than once.
    // Keep both endpoint cells narrower than the mobile viewport so their
    // rendered corner handles remain hit-testable after scrollIntoView.
    await commitWidthsProduction(page, await singleGridId(page), { id: 1_000, title: 300, done: 300 });
    await expect.poll(() => grid.evaluate((node: HTMLElement) => node.scrollWidth > node.clientWidth)).toBe(true);
    return grid;
}

export async function placeSameGridAgain(page: Page): Promise<Locator> {
    const gridId = await singleGridId(page);
    await page.locator(".outliner-item[data-item-id]").last().click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    const panel = page.getByTestId("yjs-table-create-panel").last();
    await panel.getByRole("button", { name: "Existing Grid" }).click();
    await panel.getByTestId("yjs-grid-existing-select").selectOption(gridId);
    await panel.getByTestId("yjs-grid-select-existing").click();
    await expect(page.getByTestId("yjs-table-grid")).toHaveCount(2);
    return page.getByTestId("yjs-table-grid").nth(1);
}

/** Activates an existing logical cell, then enters production long-press range mode. */
export async function enterTouchRangeMode(page: Page, cell: Locator): Promise<void> {
    await cell.scrollIntoViewIfNeeded();
    const box = await cell.boundingBox();
    expect(box).not.toBeNull();
    const point = TouchGestures.pointInBox(box!, 0.5);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(400);
    await TouchGestures.longPress(page, point);
    await expect(page.getByRole("toolbar", { name: "Grid selection actions" })).toBeVisible();
}
