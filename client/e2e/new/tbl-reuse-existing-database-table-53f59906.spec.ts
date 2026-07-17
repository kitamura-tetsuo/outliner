import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-53f59906: Yjs + PGlite database table block - reuse existing table", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Database table demo item 1",
            "Database table demo item 2",
        ]);
    });

    test("create a table in one item and select it from existing in another item", async ({ page }) => {
        // Focus the first item and add a Database block
        await expect(page.locator(".outliner-item").nth(0)).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").nth(0).click();
        await page.waitForTimeout(300);

        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        // Create a Tasks table named "Shared Tasks"
        const createPanel1 = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel1).toBeVisible({ timeout: 10000 });
        await createPanel1.getByTestId("yjs-table-name-input").fill("Shared Tasks");
        await createPanel1.getByTestId("yjs-table-preset-select").selectOption("tasks");
        await createPanel1.getByTestId("yjs-table-create").click();

        const grid1 = page.getByTestId("yjs-table-grid").first();
        await expect(grid1.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });

        // Add a row in the first block
        await page.getByTestId("yjs-table-add-row").first().click();
        const row1 = grid1.locator("tbody tr").first();
        await expect(row1).toBeVisible({ timeout: 10000 });

        await page.waitForTimeout(3000);

        const titleCell1 = row1.locator('td[data-col="title"] .cell-value');
        await expect(titleCell1).toBeVisible({ timeout: 15000 });
        await titleCell1.click();
        const titleInput1 = row1.locator('td[data-col="title"] input.cell-input');
        await expect(titleInput1).toBeVisible({ timeout: 15000 });
        await titleInput1.fill("Important Task", { force: true });
        await page.keyboard.press("Enter");

        await expect(grid1.locator('td[data-col="title"] .cell-value', { hasText: "Important Task" })).toBeVisible({
            timeout: 15000,
        });

        // Focus the second item and add a Database block
        await page.locator(".outliner-item").nth(1).click();
        await page.waitForTimeout(300);
        await addDatabaseBtn.click();

        const createPanel2 = page.getByTestId("yjs-table-create-panel").first(); // It is the only panel open now
        await expect(createPanel2).toBeVisible({ timeout: 10000 });

        // Switch to Existing Table tab
        await createPanel2.locator("button.mode-tab", { hasText: "Existing Table" }).click();

        // Select the table
        const existingSelect = createPanel2.getByTestId("yjs-table-existing-select");
        await expect(existingSelect).toBeVisible();

        // Check options
        const options = await existingSelect.locator("option").allTextContents();
        expect(options).toContain("Shared Tasks");

        // By default the first one is selected, click select
        await createPanel2.getByTestId("yjs-table-select-existing").click();

        // The second block should now show the grid with the same data
        const grid2 = page.getByTestId("yjs-table-grid").nth(1);
        await expect(grid2.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });

        // Wait for data to sync (we should see the same row in the new block)
        await expect(grid2.locator('td[data-col="title"] .cell-value', { hasText: "Important Task" })).toBeVisible({
            timeout: 15000,
        });
    });
});
