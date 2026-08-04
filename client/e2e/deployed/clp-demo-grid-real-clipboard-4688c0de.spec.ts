/** @feature CLP-4584c0de */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const advancedFeaturesPath = "/demo/Advanced%20Features";

async function resetDemo(page: Page) {
    await page.goto("/demo");
    const reset = page.getByTestId("demo-reset-button");
    await expect(reset).toBeEnabled({ timeout: 30000 });
    await reset.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const [response] = await Promise.all([
        page.waitForResponse(value => value.url().includes("/api/seed-demo") && value.request().method() === "POST"),
        dialog.getByRole("button", { name: "Reset", exact: true }).click(),
    ]);
    expect(response.ok(), `demo cleanup failed with HTTP ${response.status()}`).toBe(true);
    await expect(page.getByTestId("demo-reset-done")).toBeVisible({ timeout: 30000 });
}

async function dragAcrossWholeItems(start: Locator, end: Locator) {
    const page = start.page();
    const startBox = await start.boundingBox();
    const endBox = await end.boundingBox();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    await page.mouse.move(startBox!.x - 4, startBox!.y + startBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(endBox!.x + endBox!.width + 4, endBox!.y + endBox!.height / 2, { steps: 24 });
    await page.mouse.up();
}

test.afterEach(async ({ page }) => {
    await resetDemo(page);
});

test("deployed demo preserves the Sales Grid binding through the real clipboard", async ({ page }) => {
    await page.goto(advancedFeaturesPath);
    const grids = page.getByTestId("yjs-table-view");
    await expect(grids).toHaveCount(2, { timeout: 90000 });

    const salesHost = grids.first().locator("xpath=ancestor::*[contains(@class, 'outliner-item')][1]");
    const neighbor = salesHost.locator("xpath=following::*[contains(@class, 'outliner-item')][1]");
    await dragAcrossWholeItems(salesHost.locator(".item-text"), neighbor.locator(".item-text"));
    await page.keyboard.press("Control+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Database tables:");

    const destination = page.locator(".outliner-item[data-item-id]").last();
    await destination.locator(".item-content").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+v");

    await expect(grids).toHaveCount(3, { timeout: 30000 });
    await expect(page.getByTestId("yjs-table-sql-name").last()).toHaveText("sales");
    const originalRows = grids.first().locator("tbody tr");
    const pastedRows = grids.last().locator("tbody tr");
    await expect(pastedRows).toHaveCount(await originalRows.count());
});
