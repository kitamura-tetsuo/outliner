import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

function stableIdFromTitle(title: string): string {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < title.length; i++) {
        h ^= title.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    const hex = h.toString(16);
    return `p${hex}`;
}

test.describe("Project Deletion", () => {
    test("should allow deleting a project", async ({ page }, testInfo) => {
        // 1. Create a project using SeedClient
        const { projectName } = await TestHelpers.createAndSeedProject(page, testInfo, []);
        const projectId = stableIdFromTitle(projectName);

        // 2. Save project to Firestore (so it appears in userProjects and projectUsers)
        // SeedClient only creates the Yjs document, so we must manually trigger the saveProject Cloud Function
        const idToken = await TestHelpers.getTestAuthToken();
        const response = await page.request.post("http://localhost:57000/api/save-project", {
            data: {
                idToken,
                projectId,
            },
        });
        expect(response.ok()).toBeTruthy();

        // 3. Navigate to delete page
        await page.goto("/projects/delete");

        // Wait for the page to be ready and potentially handle login
        try {
            await expect(page.locator("h1")).toContainText("Delete Projects", { timeout: 5000 });
        } catch {
            // Fallback login if not authenticated automatically
            await TestHelpers.login(page);
            await expect(page.locator("h1")).toContainText("Delete Projects");
        }

        // 4. Find the project in the list
        // Note: The list might take a moment to load
        // The project name might not be known to the client (metaDoc) since we seeded via backend.
        // So we look for the project ID which is always displayed.
        const projectRow = page.locator("tr", { hasText: projectId });
        await expect(projectRow).toBeVisible({ timeout: 10000 });

        // 5. Select the project
        // The checkbox is inside the row
        await projectRow.locator('input[type="checkbox"]').check();

        // 6. Click Delete button
        await page.click("button:has-text('Delete')");

        // 7. Verify success message
        await expect(page.locator("text=選択したプロジェクトを削除しました")).toBeVisible();

        // 8. Verify project is removed (after reload)
        // The page reloads automatically after 1 second
        await page.waitForTimeout(2000);

        // Ensure table is visible (page reloaded)
        await expect(page.locator("table")).toBeVisible();

        // Verify the project row is gone
        await expect(page.locator("tr", { hasText: projectId })).not.toBeVisible();
    });
});
