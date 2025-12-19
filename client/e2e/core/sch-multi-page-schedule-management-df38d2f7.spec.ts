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

    test.beforeEach(async ({ page }) => {
        testProject = await TestHelpers.prepareTestEnvironment(page);

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
        test.setTimeout(180000); // Very high timeout for emulator sync
        const { projectName } = testProject;

        // Strict helper to ensure we are on the connected project and page
        const ensureConnectedPage = async () => {
            // Simplified check: just wait for the client and project to exist.
            // Internal state like currentPage title can be flaky in tests.
            await page.waitForFunction(() => {
                const win: any = window as any;
                const client = win.__YJS_STORE__?.yjsClient;
                const gs = win.generalStore;
                return !!(client && gs?.project);
            }, { timeout: 45000 });
            await page.waitForTimeout(1000); // Buffer for hydration
        };

        // Wait for connection initially
        await ensureConnectedPage();

        // Define stable page names for the test
        const pageName1 = "stable-page-1";
        const pageName2 = "stable-page-2";

        // Pre-create pages to ensure they exist with stable IDs before navigation
        await TestHelpers.createTestPageViaAPI(page, pageName1, ["Page 1 Initial Content"], { stabilityWait: 15000 });
        await TestHelpers.createTestPageViaAPI(page, pageName2, ["Page 2 Initial Content"], { stabilityWait: 15000 });

        // Go to page 1
        await page.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName1)}`);
        // Wait for title or content to confirm load
        await page.waitForSelector(`text=${pageName1}`, { timeout: 15000 });
        await ensureConnectedPage();

        // Create a schedule on the first page
        await page.getByRole("button", { name: "予約管理" }).click({ force: true });
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        await expect(page.locator("text=Schedule Management")).toBeVisible();

        // Add a new schedule
        const input = page.locator('input[type="datetime-local"]');
        const firstTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);
        await input.fill(firstTime);
        await page.locator('button:has-text("Add")').click();

        // Wait for the schedule to be added
        await page.waitForTimeout(1000);
        const items = page.locator('[data-testid="schedule-item"]');
        await expect(items).toHaveCount(1, { timeout: 15000 });

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

        // Wait for sync to happen before navigating away
        await page.waitForTimeout(1000);

        // Navigate back to page list
        await page.locator('button:has-text("Back")').click();

        // Navigate to the other page
        await page.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName2)}`);

        // Wait for page to load
        await page.waitForSelector(`text=${pageName2}`, { timeout: 20000 });
        await ensureConnectedPage();
        await page.waitForTimeout(1000); // Wait for session state to settle
        await page.waitForSelector('button:has-text("予約管理")', { timeout: 15000 });

        // Navigate to schedule management for the other page
        await page.getByRole("button", { name: "予約管理" }).click({ force: true });
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        await expect(page.locator("text=Schedule Management")).toBeVisible();

        // Verify that the schedule from the first page is NOT present in the other page
        await expect(page.locator('[data-testid="schedule-item"]')).toHaveCount(0, { timeout: 5000 });

        // Navigate back to the first page
        const backButton = page.locator('button:has-text("Back")');
        await expect(backButton).toBeEnabled();
        await backButton.click();

        // Return to the first page
        await page.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName1)}`);

        // Wait for page to load completely
        await page.waitForSelector(`text=${pageName1}`, { timeout: 20000 });
        await ensureConnectedPage();
        await page.waitForTimeout(1000); // Wait for session state to settle
        await page.waitForSelector('button:has-text("予約管理")', { timeout: 15000 });

        // Navigate to schedule management again
        await page.getByRole("button", { name: "予約管理" }).click({ force: true });
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        await expect.poll(async () => {
            const count = await page.locator('[data-testid="schedule-item"]').count();
            return count;
        }, { timeout: 20000, intervals: [1000] }).toBe(1);

        // Cancel the schedule to clean up
        const finalItems = page.locator('[data-testid="schedule-item"]');
        await expect(finalItems).toHaveCount(1);
        await finalItems.first().locator('button:has-text("Cancel")').click();
        await expect(finalItems).toHaveCount(0, { timeout: 5000 });
    });
});
