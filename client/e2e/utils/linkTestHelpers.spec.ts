import { test, expect } from "@playwright/test";
import { LinkTestHelpers } from "./linkTestHelpers";

test.describe('LinkTestHelpers unit tests', () => {
    test('forceRenderInternalLinks converts bracket link to anchor', async ({ page }) => {
        await page.setContent('<div class="outliner-item"><div class="item-text">Example [page]</div></div>');
        await LinkTestHelpers.forceRenderInternalLinks(page);
        const link = page.locator('a.internal-link');
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAttribute('href', '/page');
    });

    test('detectInternalLink finds rendered link', async ({ page }) => {
        await page.setContent('<div class="outliner-item"><div class="item-text">Check [page]</div></div>');
        await LinkTestHelpers.forceRenderInternalLinks(page);
        const exists = await LinkTestHelpers.detectInternalLink(page, 'page');
        expect(exists).toBe(true);
    });

    test('forceLinkPreview shows preview popup', async ({ page }) => {
        await page.setContent('<a href="/preview" class="internal-link" data-page="preview">preview</a>');
        await LinkTestHelpers.forceLinkPreview(page, 'preview');
        const popup = page.locator('.link-preview-popup');
        await expect(popup).toBeVisible();
    });
});
