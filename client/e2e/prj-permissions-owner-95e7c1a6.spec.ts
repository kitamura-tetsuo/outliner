import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import "./utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

// Test Owner permissions
test.describe("Project Permissions - Owner", () => {
    test("Owner can create project and has full access", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create a test user
        const ownerUser = await helpers.createTestUser();

        // Login as owner
        await helpers.login(ownerUser.email, ownerUser.password);

        // Create a new project
        const containerId = await helpers.createNewProject("Owner Test Project");

        // Verify project is created successfully
        expect(containerId).toBeTruthy();

        // Verify owner has access to project
        await expect(page.getByText("Owner Test Project")).toBeVisible();

        // Verify owner can edit content
        await helpers.addItem("Test Item");
        await expect(page.getByText("Test Item")).toBeVisible();

        // Verify owner can delete project
        await helpers.deleteProject(containerId);

        // Verify project is deleted
        await expect(page.getByText("Owner Test Project")).not.toBeVisible();
    });

    test("Owner can manage permissions", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();
        const editorUser = await helpers.createTestUser();
        const viewerUser = await helpers.createTestUser();

        // Login as owner
        await helpers.login(ownerUser.email, ownerUser.password);

        // Create a new project
        const containerId = await helpers.createNewProject("Permission Management Test");

        // Add editor
        await helpers.addProjectPermission(containerId, editorUser.email, "editor");

        // Add viewer
        await helpers.addProjectPermission(containerId, viewerUser.email, "viewer");

        // Verify permissions are set correctly
        const permissions = await helpers.getProjectPermissions(containerId);
        expect(permissions.owners).toHaveLength(1);
        expect(permissions.editors).toHaveLength(1);
        expect(permissions.viewers).toHaveLength(1);

        // Verify owner can remove permissions
        await helpers.removeProjectPermission(containerId, viewerUser.email);

        const updatedPermissions = await helpers.getProjectPermissions(containerId);
        expect(updatedPermissions.viewers).toHaveLength(0);
    });
});

// Test Editor permissions
test.describe("Project Permissions - Editor", () => {
    test("Editor can edit content but cannot delete project", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();
        const editorUser = await helpers.createTestUser();

        // Login as owner and create project
        await helpers.login(ownerUser.email, ownerUser.password);
        const containerId = await helpers.createNewProject("Editor Permission Test");

        // Add editor
        await helpers.addProjectPermission(containerId, editorUser.email, "editor");

        // Login as editor
        await helpers.logout();
        await helpers.login(editorUser.email, editorUser.password);

        // Verify editor has access
        await expect(page.getByText("Editor Permission Test")).toBeVisible();

        // Verify editor can edit content
        await helpers.addItem("Editor Item");
        await expect(page.getByText("Editor Item")).toBeVisible();

        // Verify editor cannot delete project (delete button should be hidden or disabled)
        const deleteButton = page.getByText("Delete");
        await expect(deleteButton).not.toBeVisible();
    });

    test("Editor cannot manage permissions", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();
        const editorUser = await helpers.createTestUser();
        const viewerUser = await helpers.createTestUser();

        // Login as owner and create project
        await helpers.login(ownerUser.email, ownerUser.password);
        const containerId = await helpers.createNewProject("Editor Cannot Manage Test");

        // Add editor
        await helpers.addProjectPermission(containerId, editorUser.email, "editor");

        // Login as editor
        await helpers.logout();
        await helpers.login(editorUser.email, editorUser.password);

        // Try to add a viewer (should fail)
        const response = await helpers.addProjectPermission(containerId, viewerUser.email, "viewer", true);
        expect(response.success).toBe(false);
    });
});

// Test Viewer permissions
test.describe("Project Permissions - Viewer", () => {
    test("Viewer can view but cannot edit", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();
        const viewerUser = await helpers.createTestUser();

        // Login as owner and create project
        await helpers.login(ownerUser.email, ownerUser.password);
        const containerId = await helpers.createNewProject("Viewer Permission Test");

        // Add viewer
        await helpers.addProjectPermission(containerId, viewerUser.email, "viewer");

        // Login as viewer
        await helpers.logout();
        await helpers.login(viewerUser.email, viewerUser.password);

        // Verify viewer has access
        await expect(page.getByText("Viewer Permission Test")).toBeVisible();

        // Verify viewer cannot edit (add button should be hidden or disabled)
        const addButton = page.getByText("Add");
        await expect(addButton).not.toBeVisible();

        // Verify viewer cannot delete
        const deleteButton = page.getByText("Delete");
        await expect(deleteButton).not.toBeVisible();
    });

    test("Viewer cannot manage permissions", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();
        const viewerUser = await helpers.createTestUser();

        // Login as owner and create project
        await helpers.login(ownerUser.email, ownerUser.password);
        const containerId = await helpers.createNewProject("Viewer Cannot Manage Test");

        // Add viewer
        await helpers.addProjectPermission(containerId, viewerUser.email, "viewer");

        // Login as viewer
        await helpers.logout();
        await helpers.login(viewerUser.email, viewerUser.password);

        // Try to add an editor (should fail)
        const response = await helpers.addProjectPermission(containerId, "fake@example.com", "editor", true);
        expect(response.success).toBe(false);
    });
});

// Test Permission UI
test.describe("Project Permissions - UI", () => {
    test("Permission management UI displays correctly", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();
        const editorUser = await helpers.createTestUser();

        // Login as owner and create project
        await helpers.login(ownerUser.email, ownerUser.password);
        const containerId = await helpers.createNewProject("UI Test Project");

        // Add editor
        await helpers.addProjectPermission(containerId, editorUser.email, "editor");

        // Navigate to permissions page
        await page.goto(`/projects/${containerId}/permissions`);

        // Verify permissions are displayed
        await expect(page.getByText("Owner")).toBeVisible();
        await expect(page.getByText("Editors")).toBeVisible();
        await expect(page.getByText("Viewers")).toBeVisible();

        // Verify owner badge
        await expect(page.locator(".permission-badge.owner")).toBeVisible();

        // Verify editor badge
        await expect(page.locator(".permission-badge.editor")).toBeVisible();
    });

    test("Add collaborator functionality", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();

        // Login as owner and create project
        await helpers.login(ownerUser.email, ownerUser.password);
        const containerId = await helpers.createNewProject("Add Collaborator Test");

        // Navigate to permissions page
        await page.goto(`/projects/${containerId}/permissions`);

        // Add collaborator
        await page.fill('input[name="email"]', "newcollaborator@example.com");
        await page.selectOption('select[name="role"]', "editor");
        await page.click('button:has-text("Add")');

        // Verify collaborator is added
        await expect(page.getByText("newcollaborator@example.com")).toBeVisible();
    });

    test("Remove collaborator functionality", async ({ page }) => {
        const helpers = new TestHelpers(page);

        // Create test users
        const ownerUser = await helpers.createTestUser();
        const collaboratorUser = await helpers.createTestUser();

        // Login as owner and create project
        await helpers.login(ownerUser.email, ownerUser.password);
        const containerId = await helpers.createNewProject("Remove Collaborator Test");

        // Add collaborator
        await helpers.addProjectPermission(containerId, collaboratorUser.email, "editor");

        // Navigate to permissions page
        await page.goto(`/projects/${containerId}/permissions`);

        // Remove collaborator
        await page.click(`[data-user-email="${collaboratorUser.email}"] button.remove`);

        // Verify collaborator is removed
        await expect(page.getByText(collaboratorUser.email)).not.toBeVisible();
    });
});
