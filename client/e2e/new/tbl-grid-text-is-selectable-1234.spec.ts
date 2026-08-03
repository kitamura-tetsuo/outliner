import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("Grid text is selectable", async ({ page }) => {
    const helpers = new TestHelpers(page);
    await helpers.seedAndVisit("test-project", []);
    await page.getByTestId("add-database-btn").click();
    await page.getByRole("button", { name: "Tasks" }).click();
    await page.getByTestId("yjs-table-create").click();
    // Wait for table to render
    await expect(page.getByTestId("yjs-table-name")).toBeVisible();

    // Select table name
    const tableName = page.getByTestId("yjs-table-name");
    const box = await tableName.boundingBox();
    if (box) {
        await page.mouse.move(box.x + 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
        await page.mouse.up();
    }

    // Check selection
    // eslint-disable-next-line no-restricted-globals
    let selection = await page.evaluate(() => window.getSelection()?.toString());
    expect(selection).toContain("Tasks");

    // Wait 200ms and check again (regression check for focus steal)
    await page.waitForTimeout(200);
    // eslint-disable-next-line no-restricted-globals
    selection = await page.evaluate(() => window.getSelection()?.toString());
    expect(selection).toContain("Tasks");

    // Step 4: Select column header label
    const headerLabel = page.locator(".th-label").first();
    const headerBox = await headerLabel.boundingBox();
    if (headerBox) {
        await page.mouse.move(headerBox.x + 2, headerBox.y + headerBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(headerBox.x + headerBox.width - 2, headerBox.y + headerBox.height / 2);
        await page.mouse.up();
    }

    // eslint-disable-next-line no-restricted-globals
    let headerSelection = await page.evaluate(() => window.getSelection()?.toString());
    expect(headerSelection).toContain("id"); // First column is id

    await page.waitForTimeout(200);
    // eslint-disable-next-line no-restricted-globals
    headerSelection = await page.evaluate(() => window.getSelection()?.toString());
    expect(headerSelection).toContain("id");
});
