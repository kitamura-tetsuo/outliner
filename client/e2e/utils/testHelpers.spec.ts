import { test, expect } from "@playwright/test";
import { TestHelpers } from "./testHelpers";

test.describe('TestHelpers unit tests', () => {
    test('getItemIdByIndex returns dataset id', async ({ page }) => {
        await page.setContent('<div class="outliner-item" data-item-id="a1"></div>');
        const id = await TestHelpers.getItemIdByIndex(page, 0);
        expect(id).toBe('a1');
    });

    test('forceHoverEvent triggers mouseenter', async ({ page }) => {
        await page.setContent('<div id="el">hover me</div>');
        await page.evaluate(() => {
            window.hovered = false;
            const el = document.getElementById('el')!;
            el.addEventListener('mouseenter', () => { window.hovered = true; });
        });
        await TestHelpers.forceHoverEvent(page, '#el');
        const result = await page.evaluate(() => window.hovered);
        expect(result).toBe(true);
    });

    test('forceMouseOutEvent triggers mouseleave', async ({ page }) => {
        await page.setContent('<div id="el">out</div>');
        await page.evaluate(() => {
            window.left = false;
            const el = document.getElementById('el')!;
            el.addEventListener('mouseleave', () => { window.left = true; });
        });
        await TestHelpers.forceMouseOutEvent(page, '#el');
        const result = await page.evaluate(() => window.left);
        expect(result).toBe(true);
    });

    test('forceCheckVisibility returns true for visible and false for hidden', async ({ page }) => {
        await page.setContent('<div id="v" style="display:block;width:100px;height:100px;"></div><div id="h" style="display:none"></div>');
        const visible = await TestHelpers.forceCheckVisibility('#v', page, 0, 1);
        const hidden = await TestHelpers.forceCheckVisibility('#h', page, 0, 1);
        expect(visible).toBe(true);
        expect(hidden).toBe(false);
    });
});
