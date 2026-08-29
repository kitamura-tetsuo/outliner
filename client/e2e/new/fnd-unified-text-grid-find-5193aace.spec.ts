/** @feature FTR-5193aace */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test("one Find session navigates from outline text to a logical Grid cell", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Find needle in outline", "Grid host"]);
    const hostId = await TestHelpers.getItemIdByIndex(page, 2);
    await page.locator(`.outliner-item[data-item-id="${hostId}"]`).click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
    await page.getByTestId("yjs-table-create").click();
    const grid = page.getByTestId("yjs-table-grid");
    await grid.getByTestId("yjs-table-add-row").click();
    const row = grid.locator("tbody tr").first();
    await expect(row).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000);
    await row.locator('td[data-col="title"] .cell-value').click();
    await row.locator('td[data-col="title"] input.cell-input').fill("needle in Grid");
    await page.keyboard.press("Enter");
    await expect(row).toContainText("needle", { timeout: 30000 });

    await page.getByTestId("search-toggle-button").click();
    await page.getByTestId("search-input").fill("needle");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(row.locator('td[data-col="title"]')).toHaveClass(/grid-find-match/);
});
