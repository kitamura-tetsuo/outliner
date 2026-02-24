import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

// Copy of the function from client/src/lib/yjsService.svelte.ts
function stableIdFromTitle(title: string): string {
    try {
        let h = 2166136261 >>> 0; // FNV-1a basis
        for (let i = 0; i < title.length; i++) {
            h ^= title.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        const hex = h.toString(16);
        return `p${hex}`;
    } catch {
        return `p${Math.random().toString(16).slice(2)}`;
    }
}

test.describe("Bug Fix Verification: Project title persistence", () => {
    test("Project title should persist and not fall back to ID on reload", async ({ page }, testInfo) => {
        // 1. Create a project with a specific name
        // We use a timestamp to ensure uniqueness
        const projectName = "Bug Repro Project " + Date.now();
        const projectId = stableIdFromTitle(projectName);

        console.log(`Test Project: Name="${projectName}", ID="${projectId}"`);

        // Prepare environment (creates page, seeds data, navigates to project page)
        // This navigation is crucial because it triggers the client-side code that
        // saves the Project ID -> Title mapping into the local MetaDoc (IndexedDB).
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined, {
            projectName,
            skipAppReady: false,
        });

        // Verify we are on the project page and title is correct in the header
        await expect(page.locator("h1")).toContainText(projectName);

        // 2. Go to Home Page to see the Project Selector
        await page.goto("/");

        // In the test environment, we need to explicitly tell the userProject store
        // which projects the user has access to.
        console.log("Calling setAccessibleProjects...");
        await TestHelpers.setAccessibleProjects(page, [projectId]);

        // Debug: Check if store was updated
        await page.waitForFunction(() => {
            const ps = (window as any).__PROJECT_STORE__;
            return ps && ps.projects && ps.projects.length > 0;
        }, { timeout: 10000 }).catch(() => console.log("Timeout waiting for PROJECT_STORE update"));

        // Wait for the selector to appear and populate
        const selector = page.locator("select.project-select");
        await expect(selector).toBeVisible();

        // The project should be in the list with its name
        // We use evaluate to get the text of options to avoid strict mode violations
        await expect(async () => {
            const options = await selector.locator("option").allInnerTexts();
            // We check for the Name, NOT the ID.
            const foundName = options.some(opt => opt.includes(projectName));
            const foundId = options.some(opt => opt.includes(projectId));

            if (!foundName) {
                console.log(`[Retry] Project NAME "${projectName}" not found. Options: ${options.join(", ")}`);
            }

            expect(
                foundName,
                `Project NAME "${projectName}" should be found in selector options. Found: ${options.join(", ")}`,
            ).toBe(true);

            // Just to be sure we aren't seeing the ID (unless the ID IS the name, which it isn't here)
            // Note: If this fails, it means we are seeing the ID already, which is the bug!
            if (foundId && !foundName) {
                throw new Error(`Found ID "${projectId}" but NOT Name "${projectName}". This is the bug!`);
            }
        }).toPass();

        // 3. Reload the page (Home Page)
        // This triggers the race condition where firestoreStore might load IDs before metaDoc loads titles
        console.log("Reloading page...");
        await page.reload();

        // 4. Verify the selector again
        await expect(selector).toBeVisible();

        // The bug: The title is replaced by the ID
        await expect(async () => {
            const options = await selector.locator("option").allInnerTexts();

            const foundName = options.some(opt => opt.includes(projectName));
            const foundId = options.some(opt => opt.includes(projectId));

            if (foundId && !foundName) {
                throw new Error(`[REPRODUCED] Found ID "${projectId}" instead of Name "${projectName}" after reload.`);
            }

            expect(
                foundName,
                `After reload, Project NAME "${projectName}" should be visible. Found: ${options.join(", ")}`,
            ).toBe(true);
        }).toPass({ timeout: 10000 });

        await page.screenshot({ path: "client/test-results/bug-project-title-persistence.png" });
    });
});
