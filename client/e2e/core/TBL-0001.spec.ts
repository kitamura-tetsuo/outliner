import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0001: EditableQueryGrid E2E", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test("display grid and edit cell", async ({ page }) => {
    await page.goto("/min");
    await page.waitForSelector('[data-testid="sql-input"]');
    await page.fill('[data-testid="sql-input"]', 'SELECT name, value FROM items ORDER BY value DESC');
    await page.click('[data-testid="run-btn"]');
    await page.waitForSelector('[data-testid="query-grid"]');
    const firstCell = page.locator('tbody tr:first-child td:nth-child(2) input');
    await firstCell.fill('42');
    await expect(firstCell).toHaveValue('42');
  });
});
