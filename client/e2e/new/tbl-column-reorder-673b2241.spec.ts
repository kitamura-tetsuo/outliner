import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/** @feature TBL-673b2241 */
test.describe("Table column reordering", () => {
    test("reorders columns by dragging headers in TableGrid and persists order", async ({ page }, testInfo) => {
        const itemIds = await TestHelpers.seedProjectDataOnly(page, testInfo, [
            "Test Page",
        ]);

        await TestHelpers.navigateToProjectPage(page, itemIds.projectName, itemIds.pageName, ["Test Page"]);
        await TestHelpers.waitForOutlinerItems(page, 1);

        // Wait for page to load fully
        await page.waitForTimeout(500);

        // Turn the item into a table block
        const item = page.locator(".outliner-item").first();
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape"); // Ensure we're out of edit mode

        // We need a stable way to create a table. We'll use the slash command palette.
        await item.click();
        await page.keyboard.type("/table");
        await page.keyboard.press("Enter");

        // Wait for the create table panel to show up
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await createPanel.getByTestId("yjs-table-name-input").fill("Demo Table");
        await createPanel.getByTestId("yjs-table-preset-select").selectOption("blank");
        await createPanel.getByTestId("yjs-table-create").click();

        // Ensure table view appeared
        const tableBlock = page.locator(".yjs-table-view").first();
        await expect(tableBlock).toBeVisible({ timeout: 10000 });

        // Switch to Schema tab
        await tableBlock.locator("button", { hasText: "Schema" }).click();
        const schemaEditor = tableBlock.locator(".schema-editor");
        await expect(schemaEditor).toBeVisible({ timeout: 10000 });

        // Create table schema
        await schemaEditor.locator("textarea").fill(
            "CREATE TABLE test_table (id uuid, col_a text, col_b text, col_c text);",
        );
        await schemaEditor.locator("button", { hasText: "Apply Schema" }).click();

        // Switch to UI Definition tab
        await tableBlock.locator("button", { hasText: "UI" }).click();
        const uiEditor = tableBlock.locator(".ui-def-editor");
        await expect(uiEditor).toBeVisible({ timeout: 10000 });

        // Enter query
        await uiEditor.locator("input[type='text']").fill("SELECT id, col_a, col_b, col_c FROM test_table;");
        await uiEditor.locator("input[type='text']").press("Enter");

        // Wait for it to apply
        await page.waitForTimeout(500);

        // Verify Grid
        await tableBlock.locator("button", { hasText: "Grid" }).click();
        const grid = tableBlock.locator(".yjs-table-grid");
        await expect(grid).toBeVisible({ timeout: 10000 });

        // We need to add a row to see data cells
        await grid.locator("button.add-row").click();

        await expect(grid.locator("tbody tr").first()).toBeVisible({ timeout: 10000 });

        // Initial order
        let headers = await grid.locator("th[scope='col'] .th-label").allTextContents();
        headers = headers.map(h => h.trim().replace(/\s+RO$/, ""));
        expect(headers).toEqual(["id", "col_a", "col_b", "col_c"]);

        const dragSource = "col_b";
        const dropTarget = "col_a";

        const headerB = grid.locator("th[scope='col']").filter({ hasText: dragSource });
        const headerA = grid.locator("th[scope='col']").filter({ hasText: dropTarget });

        // Drag to left side of header A
        const boxB = await headerB.boundingBox();
        const boxA = await headerA.boundingBox();

        if (boxB && boxA) {
            await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2);
            await page.mouse.down();
            await page.mouse.move(boxA.x + boxA.width / 4, boxA.y + boxA.height / 2, { steps: 5 });
            await page.mouse.up();
        }

        // Let state update
        await page.waitForTimeout(500);

        let updatedHeaders = await grid.locator("th[scope='col'] .th-label").allTextContents();
        updatedHeaders = updatedHeaders.map(h => h.trim().replace(/\s+RO$/, ""));

        expect(updatedHeaders).toEqual(["id", "col_b", "col_a", "col_c"]);

        // Verify body cells follow the same order
        const dataCols = await grid.locator("tbody tr:first-child td[data-col]").evaluateAll((els) =>
            els.map(el => el.getAttribute("data-col"))
        );
        expect(dataCols).toEqual(["id", "col_b", "col_a", "col_c"]);
    });

    test("reorders columns by dragging rows in TableUiDefEditor", async ({ page }, testInfo) => {
        const itemIds = await TestHelpers.seedProjectDataOnly(page, testInfo, [
            "Test Page",
        ]);
        await TestHelpers.navigateToProjectPage(page, itemIds.projectName, itemIds.pageName, [
            "Test Page",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 1);

        // Wait for page to load fully
        await page.waitForTimeout(500);

        // Turn the item into a table block
        const item = page.locator(".outliner-item").first();
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape"); // Ensure we're out of edit mode

        // We need a stable way to create a table. We'll use the slash command palette.
        await item.click();
        await page.keyboard.type("/table");
        await page.keyboard.press("Enter");

        // Wait for the create table panel to show up
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await createPanel.getByTestId("yjs-table-name-input").fill("Demo Table 2");
        await createPanel.getByTestId("yjs-table-preset-select").selectOption("blank");
        await createPanel.getByTestId("yjs-table-create").click();

        // Wait for the table view
        const tableBlock = page.locator(".yjs-table-view").first();
        await expect(tableBlock).toBeVisible({ timeout: 10000 });

        // Switch to Schema tab
        await tableBlock.locator("button", { hasText: "Schema" }).click();
        const schemaEditor = tableBlock.locator(".schema-editor");
        await expect(schemaEditor).toBeVisible({ timeout: 10000 });

        // Create table schema
        await schemaEditor.locator("textarea").fill(
            "CREATE TABLE test_table_2 (id uuid, col_a text, col_b text, col_c text);",
        );
        await schemaEditor.locator("button", { hasText: "Apply Schema" }).click();

        // Switch to UI Definition tab
        await tableBlock.locator("button", { hasText: "UI" }).click();
        const uiEditor = tableBlock.locator(".ui-def-editor");
        await expect(uiEditor).toBeVisible({ timeout: 10000 });

        // Enter query
        await uiEditor.locator("input[type='text']").fill("SELECT id, col_a, col_b, col_c FROM test_table_2;");
        await uiEditor.locator("input[type='text']").press("Enter");

        // Wait for it to apply
        await page.waitForTimeout(500);

        // Initial order: id, a, b, c
        let rows = uiEditor.locator(".component-row .column-name");
        expect(await rows.allTextContents()).toEqual(["id", "col_a", "col_b", "col_c"]);

        // Drag 'c' (index 3) to 'a' (index 1) - 'above' dropping because of simple dragTo might target center.
        // We will simulate it using mouse events to be precise.
        const rowC = uiEditor.locator(".component-row").filter({ hasText: "col_c" }).first();
        const rowA = uiEditor.locator(".component-row").filter({ hasText: "col_a" }).first();

        const boxC = await rowC.boundingBox();
        const boxA = await rowA.boundingBox();

        if (boxC && boxA) {
            await page.mouse.move(boxC.x + boxC.width / 2, boxC.y + boxC.height / 2);
            await page.mouse.down();
            // Move over A, upper half
            await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 4, { steps: 5 });
            await page.mouse.up();
        }

        await page.waitForTimeout(500);

        // Expected order: id, c, a, b
        rows = uiEditor.locator(".component-row .column-name");
        expect(await rows.allTextContents()).toEqual(["id", "col_c", "col_a", "col_b"]);

        // Switch back to Grid tab and verify order is mirrored
        await tableBlock.locator("button", { hasText: "Grid" }).click();
        const grid = tableBlock.locator(".yjs-table-grid");
        await expect(grid).toBeVisible({ timeout: 10000 });

        let headers = await grid.locator("th[scope='col'] .th-label").allTextContents();
        headers = headers.map(h => h.trim().replace(/\s+RO$/, ""));
        expect(headers).toEqual(["id", "col_c", "col_a", "col_b"]);
    });
});
