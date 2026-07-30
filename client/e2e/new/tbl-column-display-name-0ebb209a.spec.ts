import { expect, test } from "@playwright/test";

import { TestHelpers } from "../utils/testHelpers";

/** @feature tbl-column-display-name-0ebb209a */

test("table column header shows display name independent of SQL name", async ({ page }, testInfo) => {
    // Seed a page with a simple table item
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table Test Item"]);

    // Wait for the item to appear
    await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 30000 });

    // Focus the item and open the database table create panel
    await page.locator(".outliner-item").first().click();
    await page.waitForTimeout(300);

    const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 30000 });
    await addDatabaseBtn.click();

    // The create panel appears; create a table from the Tasks preset
    const createPanel = page.getByTestId("yjs-table-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 30000 });

    await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
    await page.getByTestId("yjs-table-create").first().click();

    // The grid should now load
    const grid = page.getByTestId("yjs-table-grid").first();
    await expect(grid).toBeVisible({ timeout: 30000 });

    // Check initial header: it should show "repeat_days" because this table initially has no label for repeat_days
    const header = page.locator(`th[data-col="repeat_days"]`);
    await expect(header).toBeVisible({ timeout: 30000 });
    await expect(header).toHaveText(/repeat_days/);

    // Tooltip is initially undefined/not present
    const initialTitleAttr = await header.getAttribute("title");
    expect(initialTitleAttr).toBeNull();

    // Open UI Definition panel
    await page.getByTestId("yjs-table-toggle-ui").first().click();

    // The label input should exist
    const labelInput = page.getByTestId("yjs-table-label-repeat_days");
    await expect(labelInput).toBeVisible();

    // Set a custom label
    await labelInput.fill("Repeat Days");
    await labelInput.blur();

    // Verify the grid header changed to the new label
    await expect(header).toHaveText(/Repeat Days/);
    // Verify the data-col attribute is still the SQL name
    await expect(header).toHaveAttribute("data-col", "repeat_days");
    // Verify the tooltip (title) is the SQL name
    await expect(header).toHaveAttribute("title", "repeat_days");

    // Clear the custom label
    await labelInput.fill("");
    await labelInput.blur();

    // Verify it reverts to the SQL name
    await expect(header).toHaveText(/repeat_days/);

    const titleAttr = await header.getAttribute("title");
    expect(titleAttr).toBeNull();

    // Set the label again to test persistence across reloads
    await labelInput.fill("Repeats");
    await labelInput.blur();
    await expect(header).toHaveText(/Repeats/);

    await page.reload();

    const headerAfterReload = page.locator(`th[data-col="repeat_days"]`);
    await expect(headerAfterReload).toBeVisible({ timeout: 15000 });
    await expect(headerAfterReload).toHaveText(/Repeats/);
    await expect(headerAfterReload).toHaveAttribute("title", "repeat_days");
});
