import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("Grid text is selectable", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Empty Item"]);
    const itemId = await TestHelpers.getItemIdByIndex(page, 0);
    const item = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
    await item.click();
    await page.waitForTimeout(300);
    const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();
    await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
    await page.getByTestId("yjs-table-create").click();
    // Wait for table to render
    await expect(page.getByTestId("yjs-table-name")).toBeVisible();

    // Select table name
    const tableName = page.getByTestId("yjs-table-name");
    const box = await tableName.boundingBox();
    if (box) {
        await page.mouse.move(box.x + 2, box.y + box.height / 2);
        await page.mouse.down();
        // Give time for down event to register
        await page.waitForTimeout(50);
        // Move with steps to simulate drag
        await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 10 });
        await page.waitForTimeout(50);
        await page.mouse.up();
    }

    // Check selection
    // eslint-disable-next-line no-restricted-globals
    let selection = await page.evaluate(() => window.getSelection()?.toString());
    expect(selection).toBe("Tasks");

    // Wait 200ms and check again (regression check for focus steal)
    await page.waitForTimeout(200);
    // eslint-disable-next-line no-restricted-globals
    selection = await page.evaluate(() => window.getSelection()?.toString());
    expect(selection).toBe("Tasks");

    // Step 4: Select column header label
    const headerLabel = page.locator(".th-label").first();
    const headerBox = await headerLabel.boundingBox();
    if (headerBox) {
        await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2, {
            clickCount: 3,
        });
    }

    // eslint-disable-next-line no-restricted-globals
    let headerSelection = await page.evaluate(() => window.getSelection()?.toString());
    expect(headerSelection?.trim()?.length).toBeGreaterThan(0);

    await page.waitForTimeout(200);
    // eslint-disable-next-line no-restricted-globals
    headerSelection = await page.evaluate(() => window.getSelection()?.toString());
    expect(headerSelection?.trim()?.length).toBeGreaterThan(0);
});
