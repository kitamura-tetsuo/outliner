import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Page Route Debug", () => {
    test("debug page route loading process", async ({ page }) => {
        console.log("Debug: Starting page route debug test");

        // Capture console logs
        const logs: string[] = [];
        page.on("console", msg => {
            logs.push(`[${msg.type()}] ${msg.text()}`);
        });

        // Access home page
        await page.goto("/");

        // Set test environment flags
        await page.evaluate(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        });

        await page.reload();

        // Wait for UserManager initialization
        await page.waitForFunction(() => (window as any).__USER_MANAGER__ !== undefined, { timeout: 30000 });

        // Execute authentication
        const authResult = await page.evaluate(async () => {
            const userManager = (window as any).__USER_MANAGER__;
            return await userManager.signInWithEmailAndPassword("test@example.com", "password123");
        });

        console.log("Debug: Authentication result:", authResult);

        // Wait for global variable setting
        await page.waitForFunction(() => {
            return (window as any).__SVELTE_GOTO__;
        }, { timeout: 30000 });

        // Create project and page
        const projectName = `Debug Project ${Date.now()}`;
        const pageName = `debug-page-${Date.now()}`;

        await TestHelpers.createAndSeedProject(page, null, [], { projectName, pageName });

        // Navigate to page route
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        console.log("Debug: Navigating to:", url);
        await page.goto(url);

        // Check page state periodically
        for (let i = 0; i < 30; i++) {
            const state = await page.evaluate((i) => {
                const generalStore = (window as any).generalStore;

                return {
                    iteration: i as number,
                    hasGeneralStore: !!generalStore,
                    hasProject: !!(generalStore?.project),
                    hasPages: !!(generalStore?.pages),
                    hasCurrentPage: !!(generalStore?.currentPage),
                    pagesCount: generalStore?.pages?.current?.length || 0,
                    currentPageText: generalStore?.currentPage?.text || "none",
                    projectTitle: generalStore?.project?.title || "none",
                    outlinerBaseExists: !!document.querySelector('[data-testid="outliner-base"]'),
                    pageTitle: document.title,
                    url: window.location.href,
                };
            }, i);

            console.log(`Debug iteration ${i}:`, state);

            // End if conditions are met
            if (state.hasProject && state.hasPages && state.hasCurrentPage) {
                console.log("Debug: All conditions met!");
                break;
            }

            await page.waitForTimeout(2000); // Wait for 2 seconds
        }

        // Verify final state
        const finalState = await page.evaluate(() => {
            const generalStore = (window as any).generalStore;

            return {
                hasGeneralStore: !!generalStore,
                hasProject: !!(generalStore?.project),
                hasPages: !!(generalStore?.pages),
                hasCurrentPage: !!(generalStore?.currentPage),
                pagesCount: generalStore?.pages?.current?.length || 0,
                currentPageText: generalStore?.currentPage?.text || "none",
                projectTitle: generalStore?.project?.title || "none",
                outlinerBaseExists: !!document.querySelector('[data-testid="outliner-base"]'),
            };
        });

        console.log("Debug: Final state:", finalState);

        // Output captured console logs
        console.log("Debug: Browser console logs:");
        logs.forEach((log, index) => {
            console.log(`  ${index}: ${log}`);
        });

        // Always succeed the test (for debug purposes)
        expect(true).toBe(true);
    });
});
