/** @feature CNT-12ee98aa
 *  Title   : Shared Container Store
 *  Source  : docs/client-features/cnt-shared-container-store-12ee98aa.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CNT-12ee98aa: Shared Container Store", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("container selector lists projects from store", async ({ page }) => {
        await page.goto("/");

        await page.evaluate(() => {
            const store = window.__FIRESTORE_STORE__;
            store.userContainer = {
                userId: "u1",
                defaultContainerId: "c1",
                accessibleContainerIds: ["c1", "c2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const fsStore = window.__FLUID_SERVICE__.firestoreStore;
            fsStore.titleRegistry.set("c1", "Project A");
            fsStore.titleRegistry.set("c2", "Project B");
        });

        const options = page.locator("select.container-select option");
        await expect(options).toHaveCount(2);
        await expect(options.nth(0)).toHaveText(/Project A/);
        await expect(options.nth(1)).toHaveText(/Project B/);
    });

    test("deletion page shows projects from store", async ({ page }) => {
        await page.evaluate(() => {
            const store = window.__FIRESTORE_STORE__;
            store.userContainer = {
                userId: "u1",
                defaultContainerId: "c1",
                accessibleContainerIds: ["c1", "c2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const fsStore = window.__FLUID_SERVICE__.firestoreStore;
            fsStore.titleRegistry.set("c1", "Project A");
            fsStore.titleRegistry.set("c2", "Project B");
        });

        await page.goto("/projects/delete");
        const rows = page.locator("tbody tr");
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0).locator("td").nth(1)).toHaveText("Project A");
        await expect(rows.nth(1).locator("td").nth(1)).toHaveText("Project B");
    });
});
