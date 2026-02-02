import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Sharing", () => {
    test("Full flow: Generate link, copy, and join", async ({ page, browser }) => {
        // 1. Setup User A (owner)
        // We use createAndSeedProject which uses SeedClient (admin token) to create project.
        // Then we navigate to it.
        const seedLines = ["Task 1", "Task 2"];
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(
            page,
            { workerIndex: 0 },
            seedLines,
            { projectName: `Shared Project ${Date.now()}` },
        );

        await TestHelpers.navigateToProjectPage(page, projectName, pageName, seedLines);

        // Ensure User A is logged in (navigateToProjectPage might not ensure UI login if seeded via HTTP)
        // But TestHelpers.navigateToProjectPage uses page.goto which triggers app load.
        // App checks userManager.
        // If we are not logged in, we might be in trouble.
        // TestHelpers.login usually helps.
        await TestHelpers.login(page, "owner@example.com", "password");

        // Reload to ensure state
        await page.reload();
        await TestHelpers.waitForAppReady(page);

        // Get Project ID
        const projectId = await page.evaluate(() => {
            return (window as any).generalStore?.project?.ydoc?.guid;
        });
        expect(projectId).toBeTruthy();
        console.log("Project ID:", projectId);

        // 2. Go to Settings
        await page.goto(`/settings/${projectId}`);
        await expect(page.locator("h1")).toContainText(`Project Settings: ${projectId}`);

        // 3. Generate Link
        const generateBtn = page.locator("button", { hasText: "Generate Invitation Link" });
        await expect(generateBtn).toBeVisible();
        await generateBtn.click();

        // Wait for link
        const linkInput = page.locator("input[readonly]");
        await expect(linkInput).toBeVisible({ timeout: 10000 });
        const shareLink = await linkInput.inputValue();
        expect(shareLink).toContain("/share/");
        console.log("Share Link:", shareLink);

        // 4. User B joins
        const contextB = await browser.newContext();
        const pageB = await contextB.newPage();

        // Setup environment for Page B
        await pageB.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_E2E_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("VITE_FIREBASE_PROJECT_ID", "outliner-d57b0");
            localStorage.setItem("VITE_YJS_FORCE_WS", "true");
            (window as any).__E2E__ = true;
        });

        // Navigate to share link
        await pageB.goto(shareLink);

        // Should see "Please log in"
        await expect(pageB.locator("text=Please log in")).toBeVisible({ timeout: 10000 });

        // Login User B
        await TestHelpers.login(pageB, "joiner@example.com", "password");

        // Reload pageB (since we just logged in via console/eval, UI might not update immediately or we need to trigger the check again)
        // The share page has an effect that checks auth.
        // But TestHelpers.login does page.evaluate.
        // We might need to refresh to pick up the auth state if the component doesn't react to window.__USER_MANAGER__ changes directly or if we want to be safe.
        await pageB.reload();

        // Should now join
        await expect(pageB.locator("text=Successfully joined")).toBeVisible({ timeout: 15000 });

        // Should redirect to project
        await expect(pageB).toHaveURL(new RegExp(`/${projectId}`), { timeout: 10000 });

        // Verify access - User B should see the items
        // We need to wait for app ready on page B
        await TestHelpers.waitForAppReady(pageB);
        await TestHelpers.waitForOutlinerItems(pageB, 3); // Title + 2 tasks

        await contextB.close();
    });
});
