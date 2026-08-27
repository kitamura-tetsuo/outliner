/** @feature TBL-53f59906 */
import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

async function createTasksGrid(page: Page, testInfo: Parameters<typeof TestHelpers.seedProjectAndNavigate>[1]) {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Grid host"]);
    const hostId = await TestHelpers.getItemIdByIndex(page, 1);
    await page.locator(`.outliner-item[data-item-id="${hostId}"]`).click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
    await page.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("yjs-table-view")).toBeVisible({ timeout: 30000 });
}

async function dragSelectExactly(page: Page, target: Locator, expectedText: string) {
    const box = await target.boundingBox();
    expect(box, `${expectedText} must have a selectable bounding box`).not.toBeNull();
    await page.mouse.move(box!.x + 1, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width - 1, box!.y + box!.height / 2, { steps: 20 });
    await page.mouse.up();

    const selectedText = () => page.evaluate(() => globalThis.getSelection()?.toString().trim());
    await expect.poll(selectedText).toBe(expectedText);
    await page.waitForTimeout(300);
    expect(await selectedText()).toBe(expectedText);
}

test(
    "Grid name, SQL name, and column labels remain selectable after the editor blur delay",
    async ({ page }, testInfo) => {
        await createTasksGrid(page, testInfo);
        const grid = page.getByTestId("yjs-table-view");

        await dragSelectExactly(page, grid.getByTestId("yjs-table-name"), "Tasks");
        await dragSelectExactly(page, grid.getByTestId("yjs-table-sql-name"), "tasks");

        const firstHeader = grid.locator(".th-label").first();
        const headerText = (await firstHeader.textContent())?.trim();
        expect(headerText).toBeTruthy();
        await dragSelectExactly(page, firstHeader, headerText!);
    },
);
