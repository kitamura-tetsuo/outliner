import { test, expect } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers'; // Assuming testHelpers.ts is in ../utils/

// TODO: Ideally, use environment variables or a config file for user credentials and project names
const OWNER_A_EMAIL = 'owner@example.com';
const OWNER_A_PASSWORD = 'passwordA'; // Replace with actual test user password
const EDITOR_B_EMAIL = 'editor@example.com';
const EDITOR_B_PASSWORD = 'passwordB'; // Replace with actual test user password
const PROJECT_NAME_SHARE_TEST = 'Project Share Test'; // This project should exist or be created in a global setup

test.describe('SHR-0001: Project Sharing Flow', () => {
    test('Successful Project Sharing and Access by Editor', async ({ page, context }) => {
        // --- User A (Owner) Shares Project ---
        await TestHelpers.login(page, OWNER_A_EMAIL, OWNER_A_PASSWORD);
        await TestHelpers.navigateToProject(page, PROJECT_NAME_SHARE_TEST);

        await TestHelpers.openShareModal(page);

        const shareModal = page.locator('div.fixed.inset-0.bg-black.bg-opacity-50:has(h2:has-text("Share Project"))');
        // Expects for modal visibility are in openShareModal helper, but can double check specific content here
        await expect(shareModal.locator('h2:has-text("Share Project")')).toBeVisible();


        await shareModal.locator('input[type="email"]').fill(EDITOR_B_EMAIL);
        await shareModal.locator('select#roleToAssign').selectOption('editor');
        await shareModal.getByRole('button', { name: 'Share Project' }).click();

        await expect(shareModal.locator(`text=Project shared successfully with ${EDITOR_B_EMAIL}`)).toBeVisible({ timeout: 10000 });
        await shareModal.getByRole('button', { name: 'Cancel' }).click(); // Or Close
        await expect(shareModal.locator('h2:has-text("Share Project")')).not.toBeVisible();

        await TestHelpers.logout(page);

        // --- User B (Editor) Accesses Project ---
        await TestHelpers.login(page, EDITOR_B_EMAIL, EDITOR_B_PASSWORD);

        // Verify project is visible. For now, directly navigate.
        await TestHelpers.navigateToProject(page, PROJECT_NAME_SHARE_TEST);
        await expect(page.locator(`h1:has-text("${PROJECT_NAME_SHARE_TEST}")`)).toBeVisible();

        // --- Verify Editor Permissions ---
        // This assumes OutlinerItem.svelte structure and editing capabilities.
        // 1. Attempt to edit an existing item's text.
        const firstItemContent = page.locator('.outliner-item .item-content').first();
        await expect(firstItemContent).toBeVisible();
        await firstItemContent.dblclick(); // Assuming double click enters edit mode

        const editInput = firstItemContent.locator('textarea.item-textarea').first(); // Or input, depending on implementation
        await expect(editInput).toBeVisible();
        await expect(editInput).toBeFocused();

        const originalText = await editInput.inputValue();
        const editedText = `${originalText} - Edited by Editor B`;
        await editInput.fill(editedText);
        await editInput.press('Enter'); // Assuming Enter confirms edit

        // Wait for edit to reflect, the input field should disappear
        await expect(editInput).not.toBeVisible();
        await expect(firstItemContent.locator(`text=${editedText}`)).toBeVisible();

        // 2. Attempt to add a new item.
        // This assumes a specific way to add items, e.g., a button or a command.
        // Let's assume pressing 'Enter' on the last item (if focused) or a dedicated "Add Item" button.
        // For simplicity, let's assume 'Enter' on the now-edited item creates a new sibling below it.
        // Re-focus the edited item if needed, or use an "Add Item" button.

        // To make it simpler: let's assume there's an "Add Item" button for the project,
        // or a specific interaction on an item to add a new one.
        // If adding is via Enter key on an item, we'd do:
        // await firstItemContent.click(); // Ensure it's selected/active
        // await page.keyboard.press('Enter'); // This might create a new item
        // This is highly dependent on the specific outliner interaction.
        // For now, we'll skip the "add item" part if it's too complex without knowing the exact mechanism.
        test.info().annotations.push({ type: 'placeholder', description: 'Editor "add item" action verification step is a placeholder due to unspecified add mechanism.' });
        // Example if an "Add Item" button exists:
        // const addItemButton = page.getByRole('button', { name: 'Add Item' });
        // if (await addItemButton.isVisible()) {
        //     await addItemButton.click();
        //     await expect(page.locator('.outliner-item').nth(1)).toBeVisible(); // Assuming it adds as second item
        // } else {
        //     console.warn('"Add Item" button not found for editor test.');
        // }

        // (Optional) Logout User B
        await TestHelpers.logout(page);
    });

    // TODO: Add more test cases for sharing:
    // - Sharing with a non-existent user (expect error in modal)
    // - Trying to share with invalid role (UI should prevent or API error)
    // - User A tries to share a project they don't own (UI should prevent button or API error)
});
