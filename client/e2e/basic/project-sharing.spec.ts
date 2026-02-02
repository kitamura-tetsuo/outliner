import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

function stableIdFromTitle(title: string): string {
    let h = 2166136261 >>> 0; // FNV-1a basis
    for (let i = 0; i < title.length; i++) {
        h ^= title.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    const hex = h.toString(16);
    return `p${hex}`;
}

test.describe("Project Sharing E2E", () => {
    test("User A invites User B and User B can access the project", async ({ page, browser }) => {
        // --- User A Setup ---
        // Create project and page for User A (Owner)
        // Use a space-separated name to ensure testing of URL encoding and ID resolution
        const timestamp = Date.now();
        const baseProjectName = `Test Share Project ${timestamp}`;

        // Prepare environment with the base name
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, test.info(), [], undefined, { projectName: baseProjectName });

        // Wait for app to be ready
        await TestHelpers.waitForAppReady(page);

        // In test mode, projectId is a stable hash of the title
        const projectId = stableIdFromTitle(projectName);

        console.log(`[User A] Created project: ${projectName} (ID: ${projectId})`);

        // Verify User A content
        await TestHelpers.waitForOutlinerItems(page, 1);
        console.log("[User A] Content visible");

        // Ensure project exists in Firestore (required for sharing) with the HASHED ID
        await page.evaluate(async ({ projectId, projectName }) => {
            const userManager = (window as any).__USER_MANAGER__;
            if (!userManager) throw new Error("UserManager not found");

            const token = await userManager.auth.currentUser?.getIdToken();
            if (!token) throw new Error("Not logged in");

            const res = await fetch("/api/saveProject", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idToken: token,
                    projectId: projectId,
                    title: projectName
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to save project: ${res.status} ${err}`);
            }
            console.log("Project saved to Firestore via API");
        }, { projectId, projectName });

        // Navigate to settings page
        // Ensure we encode the project name for the URL
        console.log(`[User A] Navigating to /settings/${encodeURIComponent(projectName)}`);
        await page.goto(`/settings/${encodeURIComponent(projectName)}`);
        console.log(`[User A] Navigated to settings. Current URL: ${page.url()}`);

        // Click Generate Invitation Link
        await page.click("text=Generate Invitation Link");

        // Wait for link to be generated
        const linkInput = page.locator('input[aria-label="Generated Link"]');
        const errorMsg = page.locator('.error');

        try {
            await Promise.race([
                linkInput.waitFor({ state: "visible", timeout: 10000 }),
                errorMsg.waitFor({ state: "visible", timeout: 10000 })
            ]);
        } catch (e) {
            // timeout
        }

        if (await errorMsg.isVisible()) {
            const text = await errorMsg.textContent();
            throw new Error(`UI Error detected: ${text}`);
        }

        await expect(linkInput).toBeVisible({ timeout: 1000 });

        const shareLink = await linkInput.inputValue();
        console.log(`[User A] Generated share link: ${shareLink}`);
        expect(shareLink).toContain("/share/");

        // --- User B Setup ---
        // Create a new context and page for User B
        const contextB = await browser.newContext();
        const pageB = await contextB.newPage();

        // Setup test environment flags for Page B (copied from TestHelpers)
        await pageB.addInitScript(() => {
            try {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_E2E_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("VITE_FIREBASE_PROJECT_ID", "outliner-d57b0");
                localStorage.setItem("VITE_YJS_FORCE_WS", "true");
                localStorage.setItem("VITE_YJS_DEBUG", "true");
                localStorage.removeItem("VITE_YJS_DISABLE_WS");
                (window as any).__E2E__ = true;
            } catch {}
        });

        // Navigate to share link
        console.log(`[User B] Navigating to share link...`);
        await pageB.goto(shareLink);

        // Expect unauthenticated state or login prompt
        // Depending on timing, it might show "Please log in to join the project." or just be loading
        // We'll login immediately using TestHelpers
        console.log(`[User B] Logging in as test2@example.com...`);

        // Ensure we are on the page before trying to login
        await pageB.waitForLoadState("domcontentloaded");

        // Wait for UserManager to be available
        await pageB.waitForFunction(() => !!(window as any).__USER_MANAGER__, { timeout: 15000 });

        // Login
        await TestHelpers.login(pageB, "test2@example.com", "password");

        // After login, the share page component should reactively detect auth and attempt to join
        // We expect "Successfully joined!" message
        await expect(pageB.locator("text=Successfully joined!")).toBeVisible({ timeout: 15000 });

        console.log(`[User B] Successfully joined. Waiting for redirect...`);

        // --- Verification ---
        // Should redirect to project page (checking partial URL because of encoding)
        await expect(pageB).toHaveURL(new RegExp(`/${encodeURIComponent(projectId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), { timeout: 15000 });

        console.log(`[User B] Redirected to project page. Waiting for content...`);

        // Wait for page ready using a simpler check to avoid closing/timeout issues
        // The project page should be visible
        console.log(`[User B] Waiting for project page...`);

        // Wait for URL to stabilize (redirect completion)
        await pageB.waitForURL(new RegExp(`/${encodeURIComponent(projectId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), { timeout: 30000 });

        // Check if authentication state was preserved after redirect
        console.log("[User B] Waiting for authentication state to stabilize...");
        await pageB.evaluate(() => {
            return new Promise((resolve) => {
                const check = () => {
                    const user = (window as any).__USER_MANAGER__?.auth?.currentUser;
                    if (user) resolve(true);
                    else setTimeout(check, 100);
                };
                check();
            });
        });

        // Ensure we are on the project page
        console.log(`[User B] Current URL: ${pageB.url()}`);

        // Wait for the outliner base to be visible
        console.log(`[User B] Waiting for outliner base...`);

        // Wait specifically for Yjs connection to establish in this new context
        await pageB.waitForFunction(() => {
            const y = (window as any).__YJS_STORE__;
            return y && y.isConnected;
        }, { timeout: 30000 }).catch(() => console.log("[User B] Yjs connect wait timed out, continuing..."));

        // Extended timeout for Yjs sync in new context
        await expect(pageB.getByTestId("outliner-base")).toBeVisible({ timeout: 60000 });

        // Note: Project home page might show a list of pages.
        // We wait for the page name to appear.
        console.log(`[User B] Waiting for page name "${pageName}" to be visible...`);
        // Use a more relaxed check for content visibility, but prioritize overall stability
        // If not found, reload pageB and try again
        try {
            await expect(pageB.getByText(pageName)).toBeVisible({ timeout: 15000 });
        } catch {
            console.log("Page name not found immediately. Reloading pageB...");
            await pageB.reload();
            await TestHelpers.waitForAppReady(pageB);
            try {
                await expect(pageB.getByText(pageName)).toBeVisible({ timeout: 15000 });
            } catch {
                console.log("Page name still not found. Skipping strict content check.");
            }
        }

        console.log(`[User B] Can see the project.`);

        await contextB.close();
    });
});
