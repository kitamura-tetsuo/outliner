import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';
// import { UserManager } from '../../src/auth/UserManager'; // Not directly used in this version

const OWNER_EMAIL = 'testuser1@example.com';
const OWNER_PASSWORD = 'password123';
const SHARED_USER_EMAIL = 'testuser2@example.com';
const SHARED_USER_PASSWORD = 'password123';

async function login(page: Page, email: string, password?: string) {
    console.log(`Attempting login for ${email}`);
    if (email === OWNER_EMAIL) {
        await TestHelpers.loginAsTestUser(page, 'owner');
    } else if (email === SHARED_USER_EMAIL) {
        await TestHelpers.loginAsTestUser(page, 'shared_user');
    } else {
        await TestHelpers.loginAsTestUser(page, 'default');
    }
    console.log(`Login attempt for ${email} completed (simulated).`);
}

test.describe('SHR-0001: Project Sharing Tests', () => {
    let ownerContext: BrowserContext;
    let ownerPage: Page;

    test.beforeAll(async ({ browser }) => {
        ownerContext = await browser.newContext();
    });

    test.beforeEach(async ({}, testInfo) => {
        ownerPage = await ownerContext.newPage();
        ownerPage.on('console', msg => {
            // Log all console messages from the page to the test output
            console.log(`E2E PAGE LOG [${msg.type()}] ${msg.text()}`);
        });
        await TestHelpers.prepareTestEnvironment(ownerPage, testInfo);
    });

    test.afterEach(async () => {
        await ownerPage.close();
    });

    test.afterAll(async () => {
        await ownerContext.close();
    });

    test('Owner can generate a shareable link for a project', async () => {
        await login(ownerPage, OWNER_EMAIL, OWNER_PASSWORD);

        const projectName = `TestShareProject-${Date.now()}`;
        const projectUrl = await TestHelpers.createNewProject(ownerPage, projectName);
        await ownerPage.goto(projectUrl);
        await ownerPage.waitForSelector('body[data-app-ready="true"]', { timeout: 20000 });
        console.log(`Navigated to ${projectUrl}, waiting for outliner items...`);
        await ownerPage.waitForSelector(".outliner-item", { timeout: 15000 });
        console.log("Outliner items found.");

        const shareButton = ownerPage.locator('[data-testid="project-share-button"]');
        await expect(shareButton).toBeVisible({ timeout: 10000 });
        await shareButton.click();

        const shareDialog = ownerPage.locator('[data-testid="share-dialog"]');
        await expect(shareDialog).toBeVisible();

        const shareLinkInput = ownerPage.locator('[data-testid="share-link-input"]');
        const shareLink = await shareLinkInput.inputValue();

        expect(shareLink).toContain('/shared-project/');
        expect(shareLink).toContain(projectUrl.split('/').pop());
        console.log('Generated share link:', shareLink);

        const permissionEditRadio = ownerPage.locator('input[name="sharePermission"][value="edit"]');
        await expect(permissionEditRadio).toBeVisible();
        await permissionEditRadio.check();

        let alertMessage = '';
        ownerPage.on('dialog', async dialog => {
            console.log(`Dialog message: ${dialog.message()}`);
            alertMessage = dialog.message();
            await dialog.accept();
        });

        const savePermissionsButton = ownerPage.locator('button:has-text("権限を保存")');
        await expect(savePermissionsButton).toBeVisible();
        await savePermissionsButton.click();

        expect(alertMessage).toContain('Permissions set to: edit');

        const closeDialogButton = ownerPage.locator('button:has-text("閉じる")');
        await expect(closeDialogButton).toBeVisible();
        await closeDialogButton.click();
        await expect(shareDialog).not.toBeVisible();
    });

    test('User with "View Only" permission can access the project via share link but cannot edit', async ({ browser }) => {
        await login(ownerPage, OWNER_EMAIL, OWNER_PASSWORD);
        const projectName = `ViewOnlyTestProject-${Date.now()}`;
        const projectUrl = await TestHelpers.createNewProject(ownerPage, projectName);
        await ownerPage.goto(projectUrl);
        await ownerPage.waitForSelector('body[data-app-ready="true"]', { timeout: 20000 });
        await ownerPage.waitForSelector(".outliner-item", { timeout: 15000 });

        const shareButton = ownerPage.locator('[data-testid="project-share-button"]');
        await shareButton.click();
        const shareDialog = ownerPage.locator('[data-testid="share-dialog"]');
        await expect(shareDialog).toBeVisible();

        const permissionViewRadio = ownerPage.locator('input[name="sharePermission"][value="view"]');
        await permissionViewRadio.check();

        ownerPage.on('dialog', dialog => dialog.accept());
        await ownerPage.locator('button:has-text("権限を保存")').click();

        const shareLinkInput = ownerPage.locator('[data-testid="share-link-input"]');
        const viewOnlyLink = await shareLinkInput.inputValue();
        expect(viewOnlyLink).toContain('/shared-project/');
        await ownerPage.locator('button:has-text("閉じる")').click();

        const guestContext = await browser.newContext();
        const guestPage = await guestContext.newPage();
        guestPage.on('console', msg => console.log(`GUEST PAGE LOG [${msg.type()}] ${msg.text()}`));
        await guestPage.goto(viewOnlyLink);
        await guestPage.waitForSelector('body[data-app-ready="true"]', { timeout: 20000 });
        await guestPage.waitForSelector(".outliner-item", { timeout: 15000 });

        expect(await guestPage.locator('.outliner-item').count()).toBeGreaterThan(0);

        const firstItemContent = guestPage.locator('.item-content').first();
        await firstItemContent.click({ clickCount: 1, delay: 100}).catch(() => {});
        expect(await guestPage.locator('textarea.global-textarea').count()).toBe(0);

        await guestPage.close();
        await guestContext.close();
    });

    test('User with "Edit" permission can access and edit the project via share link', async ({ browser }) => {
        await login(ownerPage, OWNER_EMAIL, OWNER_PASSWORD);
        const projectName = `EditTestProject-${Date.now()}`;
        const projectUrl = await TestHelpers.createNewProject(ownerPage, projectName);
        await ownerPage.goto(projectUrl);
        await ownerPage.waitForSelector('body[data-app-ready="true"]', { timeout: 20000 });
        await ownerPage.waitForSelector(".outliner-item", { timeout: 15000 });

        const shareButton = ownerPage.locator('[data-testid="project-share-button"]');
        await shareButton.click();
        const shareDialog = ownerPage.locator('[data-testid="share-dialog"]');
        await expect(shareDialog).toBeVisible();

        const permissionEditRadio = ownerPage.locator('input[name="sharePermission"][value="edit"]');
        await permissionEditRadio.check();

        ownerPage.on('dialog', dialog => dialog.accept());
        await ownerPage.locator('button:has-text("権限を保存")').click();

        const shareLinkInput = ownerPage.locator('[data-testid="share-link-input"]');
        const editLink = await shareLinkInput.inputValue();
        await ownerPage.locator('button:has-text("閉じる")').click();

        const editorContext = await browser.newContext();
        const editorPage = await editorContext.newPage();
        editorPage.on('console', msg => console.log(`EDITOR PAGE LOG [${msg.type()}] ${msg.text()}`));

        await editorPage.goto(editLink);
        await editorPage.waitForSelector('body[data-app-ready="true"]', { timeout: 20000 });
        await editorPage.waitForSelector(".outliner-item", { timeout: 15000 });

        const firstItem = editorPage.locator('.outliner-item .item-content').first();
        await firstItem.click();
        await editorPage.keyboard.type(' - Edited by shared user');
        await editorPage.keyboard.press('Enter');

        await editorPage.waitForTimeout(1000);

        expect(await firstItem.textContent()).toContain('Edited by shared user');

        await editorPage.close();
        await editorContext.close();
    });

    test('Unauthenticated user access to a shared project (e.g. public view)', async ({ browser }) => {
        test.skip(true, 'Skipping: Public sharing not defined/implemented.');
    });
});
