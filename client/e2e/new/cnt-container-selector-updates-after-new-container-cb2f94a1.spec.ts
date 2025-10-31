import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CNT-12ee98aa
 *  Title   : Shared Container Store
 *  Source  : docs/client-features/cnt-shared-container-store-12ee98aa.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @playwright
 * @title Dropdown updates after new container is added
 * @description After programmatically adding a container to the shared store, the ContainerSelector should show the new option.
 */

test.describe("CNT-12ee98aa: Shared Container Store", () => {
    test("dropdown list updates when new container is added", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo);

        // Ensure test data helper and auth are ready, then seed containers
        await page.waitForFunction(() => {
            try {
                const w: any = window as any;
                const um = w.__USER_MANAGER__;
                return !!(w.__TEST_DATA_HELPER__ && um && um.auth && um.auth.currentUser);
            } catch {
                return false;
            }
        }, { timeout: 20000 });
        await page.evaluate(() => (window as any).__TEST_DATA_HELPER__?.setupTestEnvironment?.());

        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();
        const initialCount = await select.locator("option").count();

        // Programmatically add a new container to the store
        await page.evaluate(() => {
            const fs: any = (window as any).__FIRESTORE_STORE__;
            if (fs?.userContainer) {
                fs.userContainer.accessibleContainerIds.push("test-container-3");
            }
        });

        // Wait for the dropdown to reflect the new container
        await page.waitForFunction(
            (count) => document.querySelectorAll("select.container-select option").length > count,
            initialCount,
            { timeout: 10000 },
        );

        const options = select.locator("option");
        await expect(options).toHaveCount(initialCount + 1);
        await expect(options.last()).toHaveText(/テストプロジェクト/);
    });
});
