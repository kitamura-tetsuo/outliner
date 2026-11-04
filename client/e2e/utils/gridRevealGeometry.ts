import { expect, type Locator, type Page } from "@playwright/test";

export interface GridRevealGeometry {
    gridLeft: number;
    gridRight: number;
    scrollLeft: number;
    scrollTop: number;
    scrollWidth: number;
    clientWidth: number;
    pageX: number;
    pageY: number;
    targetLeft: number;
    targetRight: number;
}

export async function gridRevealGeometry(grid: Locator, target: Locator): Promise<GridRevealGeometry> {
    return grid.evaluate((element, targetElement) => {
        const viewport = element.getBoundingClientRect();
        const cell = (targetElement as HTMLElement).getBoundingClientRect();
        return {
            gridLeft: viewport.left + element.clientLeft,
            gridRight: viewport.left + element.clientLeft + element.clientWidth,
            scrollLeft: element.scrollLeft,
            scrollTop: element.scrollTop,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            pageX: globalThis.scrollX,
            pageY: globalThis.scrollY,
            targetLeft: cell.left,
            targetRight: cell.right,
        };
    }, await target.elementHandle());
}

export async function addExistingGridPlacement(page: Page, gridId: string): Promise<void> {
    await page.locator(".outliner-item[data-item-id]").last().click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    const panel = page.getByTestId("yjs-table-create-panel").last();
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Existing Grid" }).click();
    await panel.getByTestId("yjs-grid-existing-select").selectOption(gridId);
    await panel.getByTestId("yjs-grid-select-existing").click();
    await expect(page.getByTestId("yjs-table-grid")).toHaveCount(2);
}
