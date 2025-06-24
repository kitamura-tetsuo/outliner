import { test, expect } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';
import { TreeValidator } from '../utils/treeValidation';
import { CursorValidator } from '../utils/cursorValidation';

test.describe('CMD-0001: Inline Command Palette', () => {
	test.beforeEach(async ({ page }) => {
		await TestHelpers.prepareTestEnvironment(page);
		await TestHelpers.createProject(page, 'CMD-0001-Project');
		await TestHelpers.createPage(page, 'CMD-0001-Page');
		await TestHelpers.waitForPageReady(page);
	});

	test('should display palette on typing "/" and insert Table', async ({ page }) => {
		const initialItem = await TestHelpers.getActiveItemLocator(page);
		await initialItem.click();
		await page.keyboard.type('Hello ');
		await page.keyboard.type('/');

		// Check if palette is visible
		const commandPalette = page.locator('.command-palette');
		await expect(commandPalette).toBeVisible();
		await expect(commandPalette.locator('li:has-text("Table")')).toBeVisible();
		await expect(commandPalette.locator('li:has-text("Chart")')).toBeVisible();

		// Click Table option
		await commandPalette.locator('li:has-text("Table")').click();

		// Verify palette is hidden
		await expect(commandPalette).toBeHidden();

		// Verify new item with table placeholder is inserted
		const expectedTree = [
			{
				id: expect.any(String),
				text: 'Hello ',
				children: [],
			},
			{
				id: expect.any(String),
				text: '[[EditableJoinTable]]',
				children: [],
			},
		];
		await TreeValidator.validateTree(page, expectedTree);

		// Verify EditableQueryGrid component is rendered in the new item
		const tableItem = page.locator('[data-item-id]').nth(1);
        await expect(tableItem.locator('.editable-query-grid')).toBeVisible();


		// Verify cursor is in the new table item (or a sensible default like end of previous or start of new)
        // For now, let's check if the new item is focused/active, which is a good proxy.
        // The CommandPalette.svelte attempts to set focus.
        const newActiveItem = await TestHelpers.getActiveItemLocator(page);
        const newActiveItemId = await newActiveItem.getAttribute('data-item-id');
        const tableItemId = await tableItem.getAttribute('data-item-id');
        expect(newActiveItemId).toBe(tableItemId);

        // More precise cursor check:
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursors.length).toBe(1);
        expect(cursorData.cursors[0].itemId).toBe(tableItemId);
        expect(cursorData.cursors[0].offset).toBe(0); // Assuming cursor at the start of the new item
	});

	test('should display palette on typing "/" and insert Chart', async ({ page }) => {
		const initialItem = await TestHelpers.getActiveItemLocator(page);
		await initialItem.click();
		await page.keyboard.type('My Data ');
		await page.keyboard.type('/');

		// Check if palette is visible
		const commandPalette = page.locator('.command-palette');
		await expect(commandPalette).toBeVisible();

		// Click Chart option
		await commandPalette.locator('li:has-text("Chart")').click();

		// Verify palette is hidden
		await expect(commandPalette).toBeHidden();

		// Verify new item with chart placeholder is inserted
		const expectedTree = [
			{
				id: expect.any(String),
				text: 'My Data ',
				children: [],
			},
			{
				id: expect.any(String),
				text: '[[ChartPanel]]',
				children: [],
			},
		];
		await TreeValidator.validateTree(page, expectedTree);

        // Verify ChartPanel component is rendered in the new item
        const chartItem = page.locator('[data-item-id]').nth(1);
        await expect(chartItem.locator('.chart-panel')).toBeVisible();


		// Verify cursor is in the new chart item
        const newActiveItem = await TestHelpers.getActiveItemLocator(page);
        const newActiveItemId = await newActiveItem.getAttribute('data-item-id');
        const chartItemId = await chartItem.getAttribute('data-item-id');
        expect(newActiveItemId).toBe(chartItemId);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursors.length).toBe(1);
        expect(cursorData.cursors[0].itemId).toBe(chartItemId);
        expect(cursorData.cursors[0].offset).toBe(0);
	});

    test('Escape key should hide the command palette', async ({ page }) => {
		const initialItem = await TestHelpers.getActiveItemLocator(page);
		await initialItem.click();
		await page.keyboard.type('Test Escape ');
		await page.keyboard.type('/');

		const commandPalette = page.locator('.command-palette');
		await expect(commandPalette).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(commandPalette).toBeHidden();

        // Verify the "/" was not inserted if palette was shown
        const currentText = await TestHelpers.getItemText(page, await initialItem.getAttribute('data-item-id') || '');
        expect(currentText).toBe('Test Escape ');
	});

    test('Typing "/" at the beginning of an item should show palette', async ({ page }) => {
        const initialItem = await TestHelpers.getActiveItemLocator(page);
        await initialItem.click();
        // Ensure item is empty or type at beginning
        await page.keyboard.press('Backspace'); // Clear any default content if necessary
        await page.keyboard.type('/');

        const commandPalette = page.locator('.command-palette');
		await expect(commandPalette).toBeVisible();

        await commandPalette.locator('li:has-text("Table")').click();
        await expect(commandPalette).toBeHidden();

        const expectedTree = [
			{
				id: expect.any(String),
				text: '', // Original item where / was typed (now empty as / was consumed)
				children: [],
			},
			{
				id: expect.any(String),
				text: '[[EditableJoinTable]]',
				children: [],
			},
		];
		await TreeValidator.validateTree(page, expectedTree);
    });


    test('Typing "/" in the middle of text should show palette', async ({ page }) => {
        const initialItem = await TestHelpers.getActiveItemLocator(page);
        await initialItem.click();
        await page.keyboard.type('Start');
        await page.keyboard.type('/');
        // await page.keyboard.type('End'); // This would be typed after palette interaction

        const commandPalette = page.locator('.command-palette');
		await expect(commandPalette).toBeVisible();

        await commandPalette.locator('li:has-text("Chart")').click();
        await expect(commandPalette).toBeHidden();

        // The text where "/" was typed should remain, and the new item inserted after.
        // The "/" itself should be consumed by the palette trigger.
        const expectedTree = [
			{
				id: expect.any(String),
				text: 'Start', // Text before /
				children: [],
			},
			{
				id: expect.any(String),
				text: '[[ChartPanel]]', // Inserted component
				children: [],
			},
            // If there was text after "/", it would be in a new item or appended to "Start"
            // depending on exact insertion logic. Current logic inserts a new item.
		];
		await TreeValidator.validateTree(page, expectedTree);

        // Check cursor position - should be in the new chart item.
        const chartItem = page.locator('[data-item-id]').nth(1);
        const chartItemId = await chartItem.getAttribute('data-item-id');
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursors.length).toBe(1);
        expect(cursorData.cursors[0].itemId).toBe(chartItemId);
        expect(cursorData.cursors[0].offset).toBe(0);
    });
});
