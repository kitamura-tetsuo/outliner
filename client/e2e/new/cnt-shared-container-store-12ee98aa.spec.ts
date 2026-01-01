import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CNT-12ee98aa
 *  Title   : Shared Container Store
 *  Source  : docs/client-features/cnt-shared-container-store-12ee98aa.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CNT-12ee98aa: Shared Container Store", () => {
    test("container selector shows options", async ({ page }) => {
        await page.goto("http://localhost:7090/");
        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();
    });

    test("container selector lists projects from store", async ({ page }, testInfo) => {
        // ContainerSelector is on the home page, not project pages
        // Use skipSync to avoid navigating to a project page
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined, { skipSync: true });

        // Set up accessible projects for container selector
        await TestHelpers.setAccessibleProjects(page, ["test-project-1", "test-project-2"]);

        // Navigate to home page
        await page.goto("http://localhost:7090/");

        // Wait for auth and store to be ready
        await page.waitForFunction(() => {
            try {
                const um = (window as any).__USER_MANAGER__;
                return !!(um && um.auth && um.auth.currentUser);
            } catch {
                return false;
            }
        }, { timeout: 20000 });

        // Wait for container selector to have options
        // Wait for container selector to have options
        await page.waitForFunction(() => {
            const cs = (window as any).__CONTAINER_STORE__;
            return cs && Array.isArray(cs.containers) && cs.containers.length >= 2;
        }, { timeout: 30000 });

        const options = page.locator("select.container-select option");
        await expect(options).toHaveCount(2);
        await expect(options.nth(0)).toHaveText(/test-project-1/);
        await expect(options.nth(1)).toHaveText(/test-project-2/);
    });

    test("deletion page shows projects from store", async ({ page }, testInfo) => {
        // Use skipSync to avoid navigating to a project page
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined, { skipSync: true });

        // Set up accessible projects
        await TestHelpers.setAccessibleProjects(page, ["test-project-1", "test-project-2"]);

        // Navigate to deletion page
        await page.goto("/projects/delete");

        // Wait for hydration and global objects to be available
        await page.waitForFunction(() => {
            return typeof (window as any).__FIRESTORE_STORE__ !== "undefined"
                && typeof (window as any).__USER_MANAGER__ !== "undefined";
        }, { timeout: 10000 });

        // Wait for Firebase test user login
        await page.waitForFunction(() => {
            try {
                const um = (window as any).__USER_MANAGER__;
                return !!(um && um.auth && um.auth.currentUser);
            } catch {
                return false;
            }
        }, { timeout: 20000 });

        await page.evaluate(() => (window as any).__INIT_FIRESTORE_SYNC__?.());

        // Wait for the container store to have the expected data
        await page.waitForFunction(() => {
            const cs = (window as any).__CONTAINER_STORE__;
            return cs && cs.containers && cs.containers.length >= 2;
        }, { timeout: 10000 });

        // Wait for table rows to appear using Playwright's auto-waiting
        const rows = page.locator("tbody tr");
        await expect(rows).toHaveCount(2, { timeout: 15000 });
        await expect(rows.nth(0).locator("td").nth(1)).toContainText("test-project-1");
        await expect(rows.nth(1).locator("td").nth(1)).toContainText("test-project-2");
    });

    test("dropdown list shows containers after initialization", async ({ page }, testInfo) => {
        // ContainerSelector is on the home page, not project pages
        // Use skipSync to avoid navigating to a project page
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined, { skipSync: true });

        // Set up accessible projects
        await TestHelpers.setAccessibleProjects(page, ["test-project-1", "test-project-2"]);

        // Navigate to home page
        await page.goto("http://localhost:7090/");

        // Container selector should be visible
        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();

        // Wait for container store to have containers
        await page.waitForFunction(() => {
            const cs = (window as any).__CONTAINER_STORE__;
            return cs && cs.containers && cs.containers.length >= 2;
        }, { timeout: 10000 });

        // Check options exist
        const options = select.locator("option");
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThanOrEqual(2);

        // "利用可能なコンテナがありません"が表示されていないことを確認
        const noContainerOption = select.locator("option", { hasText: "利用可能なコンテナがありません" });
        await expect(noContainerOption).not.toBeVisible();
    });

    test("dropdown list is populated on page load", async ({ page }, testInfo) => {
        // ContainerSelector is on the home page, not project pages
        // Use skipSync to avoid navigating to a project page
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined, { skipSync: true });

        // Set up accessible projects
        await TestHelpers.setAccessibleProjects(page, ["test-project-1", "test-project-2"]);

        // Navigate to home page
        await page.goto("http://localhost:7090/");

        // Initial container selector visibility check
        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();

        // Wait for container store to have containers
        await page.waitForFunction(() => {
            const cs = (window as any).__CONTAINER_STORE__;
            return cs && cs.containers && cs.containers.length >= 2;
        }, { timeout: 10000 });

        // Verify options are displayed
        const options = select.locator("option");
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThanOrEqual(2);
    });
});
