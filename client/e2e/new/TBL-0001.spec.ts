/** @feature TBL-0001
 *  Title   : Editable JOIN Table
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0001: Editable JOIN Table", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

  test("query grid should be visible", async ({ page }) => {
        await page.goto("/table");
        await expect(page.locator(".editable-query-grid")).toBeVisible();
    });

    test('chart shows no data initially', async ({ page }) => {
        await page.goto('/table');
        await expect(page.locator('.chart-panel .no-data')).toBeVisible();
    });

    test('display query result', async ({ page }) => {
        await page.waitForSelector('textarea');
        await page.fill('textarea', 'SELECT 1 as value');
        await page.click('text=Run');
        await expect(page.locator('text=value')).toBeVisible();
        await expect(page.locator('text=1')).toBeVisible();
        await expect(page.locator('.chart-panel .no-data')).toBeHidden();
    });

    test('edit cell updates store and chart', async ({ page }) => {
        await page.goto('/table');
        await page.waitForSelector('textarea');
        const sql = [
            'CREATE TABLE t1(id TEXT PRIMARY KEY, a INTEGER);',
            'CREATE TABLE t2(id TEXT PRIMARY KEY, b INTEGER);',
            "INSERT INTO t1 VALUES('1',1);",
            "INSERT INTO t2 VALUES('1',2);",
            'SELECT t1.a AS t1_a, t2.b AS t2_b FROM t1 JOIN t2 ON t1.id=t2.id;'
        ].join(' ');
        await page.fill('textarea', sql);
        await page.click('text=Run');
        await page.waitForSelector('.editable-query-grid');

        const cell = page.locator('.editable-query-grid td').nth(0);
        await cell.dblclick();
        const input = page.locator('.editable-query-grid input').first();
        await input.fill('3');
        await input.press('Enter');

        const data = await TestHelpers.getQueryStoreData(page);
        expect(data?.rows?.[0]?.t1_a).toBe(3);
        await expect(page.locator('.chart-panel')).toContainText('3');
    });

    test('re-run query shows updated value', async ({ page }) => {
        await page.goto('/table');
        await page.fill('textarea', 'SELECT 1 AS value;');
        await page.click('text=Run');
        await page.waitForSelector('.editable-query-grid');

        const cell = page.locator('.editable-query-grid td').first();
        await cell.dblclick();
        const input = page.locator('.editable-query-grid input').first();
        await input.fill('5');
        await input.press('Enter');

        await page.click('text=Run');
        await expect(page.locator('.editable-query-grid')).toContainText('5');
    });

    test('chart visible after running query', async ({ page }) => {
        await page.goto('/table');
        await page.fill('textarea', 'SELECT 1 as value');
        await page.click('text=Run');
        await expect(page.locator('.chart-panel')).toBeVisible();
        await expect(page.locator('.chart-panel .no-data')).toBeHidden();
    });
});
