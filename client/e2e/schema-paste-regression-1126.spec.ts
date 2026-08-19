import { test, expect } from '@playwright/test';
import { TestHelpers } from './utils/testHelpers';

test.describe('Grid Schema Editor Paste', () => {
    test('handles textarea paste without intercepting outliner items', async ({ page }) => {
        const testInfo = test.info();
        testInfo.title = 'paste-regression';
        const projectInfo = await TestHelpers.seedProjectAndNavigate(page, testInfo, {
            lines: ['Line 1']
        });

        // Click on the first item and select Table type
        await TestHelpers.waitForOutlinerItems(page, 1);
        const item = page.locator('.outliner-item[data-item-id]').first();
        await item.click();

        await page.keyboard.press('ControlOrMeta+Shift+Enter');
        await page.keyboard.press('Tab'); // Trigger autocomplete if alias picker is up, or something to type
        await page.keyboard.type('/table');
        await page.keyboard.press('Enter');

        // Verify the Table view renders
        await expect(page.getByTestId('yjs-table-container')).toBeVisible();

        // Ensure the table schema editor is open
        const editButton = page.getByTestId('yjs-table-edit-schema');
        if (await editButton.isVisible()) {
            await editButton.click();
        }

        const schemaInput = page.getByTestId('yjs-table-schema-input');
        await expect(schemaInput).toBeVisible();

        await schemaInput.focus();
        await schemaInput.fill('CREATE TABLE test (id TEXT PRIMARY KEY)');

        await schemaInput.evaluate((el: HTMLTextAreaElement) => {
            el.selectionStart = 13;
            el.selectionEnd = 17; // Select "test"
        });

        // Set up clipboard
        await page.evaluate(() => {
            const tempInput = document.createElement('textarea');
            tempInput.id = 'clipboard-test';
            document.body.appendChild(tempInput);
        });
        const helper = page.locator('#clipboard-test');
        await helper.fill('pasted_table');
        await helper.focus();
        await helper.selectText();
        await page.keyboard.press('ControlOrMeta+C');

        // Paste it
        await schemaInput.focus();
        await page.keyboard.press('ControlOrMeta+V');

        // The textarea should have handled the paste
        await expect(schemaInput).toHaveValue('CREATE TABLE pasted_table (id TEXT PRIMARY KEY)');

        // Ensure no new outline item was created
        const itemsCount = await page.locator('.outliner-item[data-item-id]').count();
        expect(itemsCount).toBe(1);
    });
});
