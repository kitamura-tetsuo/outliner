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

    test('display query result', async ({ page }) => {
        await page.waitForSelector('textarea');
        await page.fill('textarea', 'SELECT 1 as value');
        await page.click('text=Run');
        await expect(page.locator('text=value')).toBeVisible();
        await expect(page.locator('text=1')).toBeVisible();
    });

    test('edit cell updates store and chart', async ({ page }) => {
        await page.goto('/table');
        await page.waitForSelector('textarea');
        await page.fill('textarea', 'CREATE TABLE tbl(val INTEGER); INSERT INTO tbl VALUES (1); SELECT * FROM tbl;');
        await page.click('text=Run');
        await page.waitForSelector('.editable-query-grid');

        const cell = page.locator('.editable-query-grid td').first();
        await cell.dblclick();
        const input = page.locator('.editable-query-grid input').first();
        await input.fill('2');
        await input.press('Enter');

        const data = await page.evaluate(() => {
            const qs: any = (window as any).queryStore;
            if (!qs) return null;
            let value: any;
            const unsub = qs.subscribe((v: any) => (value = v));
            unsub();
            return value;
        });

        expect(data?.rows?.[0]?.val).toBe(2);

        await expect(page.locator('.chart-panel')).toContainText('2');
    });
});
