import { test, expect } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

// TODO: Use environment variables or a config file
const OWNER_MGR_EMAIL = 'owner-mgr@example.com';
const OWNER_MGR_PASSWORD = 'passwordMgr';
const ROLE_CHANGE_EMAIL = 'rolechange@example.com';
const ROLE_CHANGE_PASSWORD = 'passwordRoleChange';
const TO_BE_REMOVED_EMAIL = 'toberemoved@example.com';
const TO_BE_REMOVED_PASSWORD = 'passwordToBeRemoved';
const EDITOR_NON_OWNER_EMAIL = 'editor-non@example.com';
const EDITOR_NON_OWNER_PASSWORD = 'passwordEditorNonOwner';

const PROJECT_ROLE_CHANGE_TEST = 'Project Role Change Test'; // Assume User A owns, User B is editor
const PROJECT_MEMBER_REMOVAL_TEST = 'Project Member Removal Test'; // Assume User A owns, User B is member
const PROJECT_NON_OWNER_TEST = 'Project Non-Owner Test'; // Assume User A owns, User C is editor


test.describe('MEM-0001: Member Management Flow', () => {
    // Test setup: Ensure projects and initial sharing states are pre-configured in the test environment.
    // For example, PROJECT_ROLE_CHANGE_TEST should have ROLE_CHANGE_EMAIL as an editor.
    // PROJECT_MEMBER_REMOVAL_TEST should have TO_BE_REMOVED_EMAIL as a member.
    // PROJECT_NON_OWNER_TEST should have EDITOR_NON_OWNER_EMAIL as an editor.
    // This setup is crucial and would typically be handled by a global setup script or seeding process.

    test('Update Member Role (Editor to Viewer)', async ({ page }) => {
        await TestHelpers.login(page, OWNER_MGR_EMAIL, OWNER_MGR_PASSWORD);
        await TestHelpers.navigateToProject(page, PROJECT_ROLE_CHANGE_TEST);

        await TestHelpers.openManageMembersModal(page);
        const membersModal = page.locator('div.fixed.inset-0.bg-black.bg-opacity-50:has(h2:has-text("Project Members"))');
        await expect(membersModal).toBeVisible(); // Already checked in helper, but good for flow

        // Use member's email (or other unique identifier visible in the list) to locate the row.
        // This relies on ProjectMembersList.svelte displaying identifiable information.
        // The component was updated to show `member.displayName || member.email || member.id`.
        // Assuming ROLE_CHANGE_EMAIL is displayed.
        const memberRow = membersModal.locator(`div.flex:has-text("${ROLE_CHANGE_EMAIL}")`).first();
        await expect(memberRow).toBeVisible();
        await expect(memberRow.locator('text=editor')).toBeVisible(); // Verify current role

        await memberRow.getByRole('button', { name: 'Change Role' }).click();
        const roleSelect = memberRow.locator('select');
        await expect(roleSelect).toBeVisible();
        await roleSelect.selectOption('viewer');

        // Feedback message might include member's ID or a generic success message.
        // Adjust based on actual feedback message from ProjectMembersList.svelte
        await expect(membersModal.locator(`text=Role for member updated successfully`)).toBeVisible({ timeout: 10000 });

        await membersModal.getByRole('button', { name: 'Close' }).click();
        await TestHelpers.logout(page);

        // Verify as User B (rolechange@example.com)
        await TestHelpers.login(page, ROLE_CHANGE_EMAIL, ROLE_CHANGE_PASSWORD);
        await TestHelpers.navigateToProject(page, PROJECT_ROLE_CHANGE_TEST);

        // --- Verify Viewer Permissions ---
        // 1. Content should be visible
        const firstItemContent = page.locator('.outliner-item .item-content').first();
        await expect(firstItemContent).toBeVisible();
        const itemText = await firstItemContent.textContent();
        expect(itemText).not.toBeNull();

        // 2. Attempt to edit (should fail or controls be absent)
        await firstItemContent.dblclick({ force: true, timeout: 1000 }); // Force dblclick even if it might not do anything
        const editInput = firstItemContent.locator('textarea.item-textarea').first();
        await expect(editInput).not.toBeVisible(); // Edit input should not appear for viewer

        // 3. Attempt to add an item (controls should be absent/disabled)
        // This depends on how items are added. If there's a global "Add Item" button:
        // const addItemButton = page.getByRole('button', { name: 'Add Item' });
        // await expect(addItemButton).not.toBeVisible(); // Or toBeDisabled()
        // If adding is via 'Enter' key on an item, this is harder to assert "disallowed" without an effect.
        // A simple check: count items, press Enter, count again.
        const initialItemCount = await page.locator('.outliner-item').count();
        await firstItemContent.click(); // Select an item
        await page.keyboard.press('Enter');
        // Wait a brief moment to see if an item is added
        await page.waitForTimeout(500); // Small delay to allow for potential (unwanted) UI update
        const finalItemCount = await page.locator('.outliner-item').count();
        expect(finalItemCount).toBe(initialItemCount); // Item count should not change for viewer

        test.info().annotations.push({ type: 'info', description: 'Viewer "add item" action restriction verified by checking item count does not change.' });

        await TestHelpers.logout(page);
    });

    test('Remove Member from Project', async ({ page }) => {
        await TestHelpers.login(page, OWNER_MGR_EMAIL, OWNER_MGR_PASSWORD);
        await TestHelpers.navigateToProject(page, PROJECT_MEMBER_REMOVAL_TEST);

        await TestHelpers.openManageMembersModal(page);
        const membersModal = page.locator('div.fixed.inset-0.bg-black.bg-opacity-50:has(h2:has-text("Project Members"))');

        // Use a more robust locator for the member row, assuming email is displayed
        const memberRow = membersModal.locator('div.flex', { has: page.locator(`p:text("${TO_BE_REMOVED_EMAIL}")`) }).first();
        await expect(memberRow).toBeVisible();

        page.once('dialog', async dialog => {
            // The confirm message in ProjectMembersList.svelte uses memberId (UID).
            // We are locating the row by email. If the confirm message also shows email or a known part of UID, that's better.
            // For now, we assume the confirm dialog is generic enough or we accept it.
            // expect(dialog.message()).toContain(TO_BE_REMOVED_EMAIL); // This might be too specific if UID is in message.
            console.log('Dialog message (for removal):', dialog.message());
            await dialog.accept();
        });

        await memberRow.getByRole('button', { name: 'Remove' }).click();

        await expect(membersModal.locator(`text=Member removed successfully`)).toBeVisible({ timeout: 10000 });
        await expect(memberRow).not.toBeVisible(); // Member removed from list in modal

        await membersModal.getByRole('button', { name: 'Close' }).click();
        await TestHelpers.logout(page);

        // Verify as User B (toberemoved@example.com)
        await TestHelpers.login(page, TO_BE_REMOVED_EMAIL, TO_BE_REMOVED_PASSWORD);

        await page.goto('/');
        const containerSelector = page.locator('div.container-selector select.container-select');
        if (await containerSelector.isVisible({timeout: 5000})) {
            const projectOption = containerSelector.locator(`option:text("${PROJECT_MEMBER_REMOVAL_TEST}")`);
            await expect(projectOption).toHaveCount(0);
        } else {
            test.info().annotations.push({ type: 'info', description: 'ContainerSelector not found on / to verify project absence. Navigating directly.' });
        }

        // Attempt direct navigation and expect redirection or a clear "access denied" message/state.
        await page.goto(`/${PROJECT_MEMBER_REMOVAL_TEST}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
        // Check if redirected to home (or another non-project URL)
        await expect(page).not.toHaveURL(new RegExp(`\/${PROJECT_MEMBER_REMOVAL_TEST}(\/.*)?$`), { timeout: 5000});
        // OR, if a specific "Access Denied" component/message appears on the page (even if URL remains):
        // await expect(page.locator('text="Access Denied"')).toBeVisible();
        // For now, checking URL is a good generic start.
        test.info().annotations.push({ type: 'info', description: 'Access denial verified by checking URL redirection.' });

    });

    test('Non-Owner Cannot Access Management Features', async ({ page }) => {
        await TestHelpers.login(page, EDITOR_NON_OWNER_EMAIL, EDITOR_NON_OWNER_PASSWORD);
        await TestHelpers.navigateToProject(page, PROJECT_NON_OWNER_TEST);

        await expect(page.getByRole('button', { name: 'Share Project' })).not.toBeVisible();
        await expect(page.getByRole('button', { name: 'Manage Members' })).not.toBeVisible();

        await TestHelpers.logout(page);
    });
});
