import { expect, test } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

test.describe("Project Settings Page", () => {
    let projectId: string;

    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
        // Create a project and capture its ID to use in the tests
        const projectDetails = await page.evaluate(async (name) => {
            const yjsService = (window as any).__YJS_SERVICE__;
            const client = await yjsService.createNewProject(name);
            return { id: client.containerId, title: name };
        }, "Settings Test Project");

        projectId = projectDetails.id;
        await page.goto(`/projects/${projectId}/settings`);
    });

    test("should display the project settings page", async ({ page }) => {
        await expect(page.locator("h1").withText("Settings for Settings Test Project")).toBeVisible();
        await expect(page.locator("h2").withText("General")).toBeVisible();
        await expect(page.locator("h2").withText("Sharing")).toBeVisible();
        await expect(page.locator("h2").withText("Permissions")).toBeVisible();
        await expect(page.locator("h2").withText("Danger Zone")).toBeVisible();
    });
});
