import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SCH-DF38D2F7
 *  Title   : Multi-Page Schedule Management
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Multi-Page Schedule Management", () => {
    let testProject: { projectName: string; pageName: string; };
    const pageName1 = "stable-page-1";
    const pageName2 = "stable-page-2";

    test.beforeEach(async ({ page }, testInfo) => {
        // Set up test environment flags BEFORE any navigation
        await page.addInitScript(() => {
            try {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_E2E_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("VITE_YJS_FORCE_WS", "true");
                localStorage.removeItem("VITE_YJS_DISABLE_WS");
                (window as Window & Record<string, any>).__E2E__ = true;
            } catch {}
        });

        // Create project with both pages upfront using createAndSeedProject
        testProject = await TestHelpers.createAndSeedProject(page, testInfo, [
            "これはテスト用のページです。1",
            "これはテスト用のページです。2",
            "これはテスト用のページです。3",
        ], {
            projectName: undefined, // Let it generate a unique name
            pageName: pageName1, // First page name
        });

        // Add second page via direct API call for multi-page test
        const { SeedClient } = await import("../utils/seedClient.js");
        const authToken = await TestHelpers.getTestAuthToken();
        const seeder = new SeedClient(testProject.projectName, authToken);
        await seeder.seed([{ name: pageName2, lines: ["Second page content"] }]);

        // Enable console logging
        page.on("console", msg => console.log("PAGE LOG:", msg.text()));

        // Clear any global state that might interfere with this test
        try {
            await page.evaluate(() => {
                try {
                    const win: any = window as any;
                    // Clear any schedule-related global variables
                    if (win.__SCHEDULE_STATE__) {
                        win.__SCHEDULE_STATE__ = {};
                    }

                    // Clear any editor overlay state that might affect scheduling
                    if (win.editorOverlayStore) {
                        const editorStore = win.editorOverlayStore;
                        if (typeof editorStore.reset === "function") {
                            editorStore.reset();
                        } else {
                            // Manual reset if no reset method
                            editorStore.cursors = {};
                            editorStore.activeItemId = null;
                            editorStore.cursorVisible = false;
                            if (editorStore.cursorInstances) {
                                editorStore.cursorInstances.clear();
                            }
                        }
                    }

                    // Clear any pending timeouts or intervals that might affect state
                    if (win.__CLEANUP_TIMEOUTS__) {
                        for (const tid of win.__CLEANUP_TIMEOUTS__) {
                            clearTimeout(tid);
                        }
                        win.__CLEANUP_TIMEOUTS__ = [];
                    }
                } catch (e) {
                    console.warn("Could not clear global state:", e);
                }
            });
        } catch (e) {
            console.warn("Could not perform global state cleanup:", e?.message ?? e);
        }
    });

    test.afterEach(async ({ page }) => {
        // Clean up any schedules created during the test to ensure test isolation
        try {
            // Check if page is still open before attempting cleanup
            if (page.isClosed()) {
                console.log("[afterEach] Page already closed, skipping schedule cleanup");
                return;
            }

            // Navigate back to the original page to cancel any created schedules
            const { projectName, pageName } = testProject;
            const encodedProject = encodeURIComponent(projectName);
            const encodedPage = encodeURIComponent(pageName);
            await page.goto(`/${encodedProject}/${encodedPage}`);

            // Wait for page to load
            await page.waitForSelector(`text=${pageName}`, { timeout: 10000 });

            // Check for schedule items and cancel them
            const scheduleItems = page.locator('[data-testid="schedule-item"]');
            const count = await scheduleItems.count();

            for (let i = 0; i < count; i++) {
                // Click cancel button to remove the schedule
                await scheduleItems.first().locator('button:has-text("Cancel")').click();
                await page.waitForTimeout(200); // Small delay between cancellations
            }

            // Wait for all items to be removed
            await expect(scheduleItems).toHaveCount(0, { timeout: 5000 });

            // Clear any global state that might interfere with other tests
            await page.evaluate(() => {
                try {
                    const win: any = window as any;
                    // Clear any schedule-related global variables
                    if (win.__SCHEDULE_STATE__) {
                        win.__SCHEDULE_STATE__ = {};
                    }

                    // Clear any editor overlay state that might affect scheduling
                    if (win.editorOverlayStore) {
                        const editorStore = win.editorOverlayStore;
                        if (typeof editorStore.reset === "function") {
                            editorStore.reset();
                        } else {
                            // Manual reset if no reset method
                            editorStore.cursors = {};
                            editorStore.activeItemId = null;
                            editorStore.cursorVisible = false;
                            if (editorStore.cursorInstances) {
                                editorStore.cursorInstances.clear();
                            }
                        }
                    }

                    // Clear any pending timeouts or intervals that might affect state
                    if (win.__CLEANUP_TIMEOUTS__) {
                        for (const tid of win.__CLEANUP_TIMEOUTS__) {
                            clearTimeout(tid);
                        }
                        win.__CLEANUP_TIMEOUTS__ = [];
                    }
                } catch (e) {
                    console.warn("Could not clear global schedule state:", e);
                }
            });
        } catch (error) {
            console.log("Error during test cleanup:", error);
        }
    });

    test("schedule operations across pages", async ({ page }) => {
        test.setTimeout(120000); // Increase timeout for stability
        const { projectName } = testProject;

        // Strict helper to ensure we are on the connected project and page
        // Waits for multiple conditions to ensure YJS client is connected and page is loaded
        const ensureConnectedPage = async () => {
            // First wait for the basic page structure to be ready
            await page.waitForFunction(() => {
                const win = window as any;
                // Check for basic page readiness
                return win.generalStore?.project !== undefined;
            }, { timeout: 30000 });

            // Then wait for YJS client to be connected (might take additional time for WebSocket)
            await page.waitForFunction(() => {
                const win = window as any;
                const client = win.__YJS_STORE__?.yjsClient;
                const gs = win.generalStore;
                // Full check: client, project, and currentPage all need to be ready
                if (!client || !gs?.project || !gs?.currentPage) return false;

                // Ensure project matches client project (confirms connected project)
                if (client.getProject) {
                    const cp = typeof client.getProject === "function" ? client.getProject() : client.getProject;
                    if (gs.project !== cp) return false;
                }

                return true;
            }, { timeout: 30000 });
        };

        // Go to page 1 using navigateToProjectPage for reliable sync
        await TestHelpers.navigateToProjectPage(page, projectName, pageName1);
        await ensureConnectedPage();

        // Open schedule for first page
        const firstPageId = await page.evaluate(() => {
            return window.generalStore?.currentPage?.id;
        });
        console.log("First page ID:", firstPageId);

        // Navigate to schedule management for the first page
        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        // Add a new schedule
        const input = page.locator('input[type="datetime-local"]');
        const firstTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);
        await input.fill(firstTime);
        await page.locator('button:has-text("Add")').click();

        // Wait for the schedule to be added
        const items = page.locator('[data-testid="schedule-item"]');
        await expect(items).toHaveCount(1, { timeout: 10000 });

        // Verify the schedule was added correctly by checking for the edit button
        const editButton = items.first().locator('button:has-text("Edit")');
        await expect(editButton).toBeEnabled();

        // Edit schedule
        await editButton.click();
        const newTime = new Date(Date.now() + 120000).toISOString().slice(0, 16);
        await items.first().locator('input[type="datetime-local"]').fill(newTime);
        await page.locator('button:has-text("Save")').click();

        // Wait for the schedule to be updated and verify the new time is displayed
        await expect(items.first().getByText(`${newTime.replace("T", " ")}`)).toBeVisible({ timeout: 10000 });

        // Navigate back to page list
        await page.locator('button:has-text("Back")').click();

        // Navigate to the other page using navigateToProjectPage for reliable sync
        // Pass the actual seed lines to ensure correct item count expectation (1 line + title = 2 items)
        await TestHelpers.navigateToProjectPage(page, projectName, pageName2, ["Second page content"]);
        await ensureConnectedPage();

        const currentPageId = await page.evaluate(() => {
            return window.generalStore?.currentPage?.id;
        });
        console.log("Current page ID for other-page:", currentPageId);

        // Navigate to schedule management for the other page
        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        // Verify that the schedule from the first page is NOT present in the other page
        await expect(page.locator('[data-testid="schedule-item"]')).toHaveCount(0, { timeout: 5000 });

        // Navigate back to the first page
        const backButton = page.locator('button:has-text("Back")');
        await expect(backButton).toBeEnabled();
        await backButton.click();

        // Return to the first page using navigateToProjectPage for reliable sync
        await TestHelpers.navigateToProjectPage(page, projectName, pageName1);
        await ensureConnectedPage();

        // Navigate to schedule management again
        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        // Wait for schedules to load and verify the schedule is still present
        await expect(page.locator('[data-testid="schedule-item"]')).toHaveCount(1, { timeout: 10000 });

        // Cancel the schedule to clean up
        const finalItems = page.locator('[data-testid="schedule-item"]');
        await expect(finalItems).toHaveCount(1);
        await finalItems.first().locator('button:has-text("Cancel")').click();
        await expect(finalItems).toHaveCount(0, { timeout: 5000 });
    });
});
