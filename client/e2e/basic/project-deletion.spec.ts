import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Deletion", () => {
    test("should allow deleting a project", async ({ page }, testInfo) => {
        // 1. Create two projects using SeedClient
        // We create a "keeper" project to ensure the table remains visible after deletion
        const timestamp = Date.now();
        const keeperName = `Keeper Project ${timestamp}`;
        const targetName = `Target Project ${timestamp}`;

        // Seed both projects
        await TestHelpers.createAndSeedProject(page, testInfo, [], { projectName: keeperName });
        await TestHelpers.createAndSeedProject(page, testInfo, [], { projectName: targetName });

        const keeperId = SeedClient.stableIdFromTitle(keeperName);
        const targetId = SeedClient.stableIdFromTitle(targetName);

        console.log(`Created projects: Keeper=${keeperName}(${keeperId}), Target=${targetName}(${targetId})`);

        // 2. Save projects to Firestore (so they appear in userProjects and projectUsers)
        const idToken = await TestHelpers.getTestAuthToken();

        // Helper to save project
        const saveProject = async (projectId: string) => {
            const response = await page.request.post("http://localhost:57000/api/save-project", {
                data: {
                    idToken,
                    projectId,
                },
            });
            expect(response.ok()).toBeTruthy();
        };

        await saveProject(keeperId);
        await saveProject(targetId);

        // 3. Navigate to delete page
        await page.goto("/projects/delete");

        // Wait for the page to be ready and potentially handle login
        // Wait for the page to be ready and ensure login
        try {
            await expect(page.locator("h1")).toContainText("Delete Projects", { timeout: 5000 });
            // The page might show H1 even if not logged in (showing empty list).
            // Ensure we are logged in to see the projects.
            await TestHelpers.login(page);

            // Ensure we see the project list. If "No projects found" is visible after login,
            // it might be a sync delay. Reloading usually fixes this in E2E.
            try {
                await expect(page.locator("table")).toBeVisible({ timeout: 5000 });
            } catch {
                console.log("Table not visible after login, reloading page...");
                await page.reload();
                await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
            }
        } catch {
            // Fallback login if something goes wrong with initial load
            await TestHelpers.login(page);
            await expect(page.locator("h1")).toContainText("Delete Projects");
            // Ensure table visibility here as well
            try {
                await expect(page.locator("table")).toBeVisible({ timeout: 5000 });
            } catch {
                console.log("Table not visible after fallback login, reloading page...");
                await page.reload();
                await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
            }
        }

        // 4. Find the projects in the list
        const keeperRow = page.locator("tr", { hasText: keeperId });
        const targetRow = page.locator("tr", { hasText: targetId });

        // Debugging: dump table content if not found
        try {
            await expect(keeperRow).toBeVisible({ timeout: 10000 });
            await expect(targetRow).toBeVisible({ timeout: 10000 });
        } catch (e) {
            console.log("Project rows not found. Current table content:");
            const rows = await page.locator("tr").allInnerTexts();
            console.log(rows);
            throw e;
        }

        // 5. Select the target project
        await targetRow.locator('input[type="checkbox"]').check();

        // 6. Click Delete button
        await page.click("button:has-text('Delete')");

        // 7. Verify success message
        await expect(page.locator("text=選択したプロジェクトを削除しました")).toBeVisible();

        // 8. Verify target is removed and keeper remains (after reload)
        // The page reloads automatically after 1 second
        await page.waitForTimeout(2000);

        // Ensure table is visible (page reloaded)
        await expect(page.locator("table")).toBeVisible();

        // Verify target is gone
        await expect(page.locator("tr", { hasText: targetId })).not.toBeVisible();

        // Verify keeper is still there
        await expect(page.locator("tr", { hasText: keeperId })).toBeVisible();
    });
});
