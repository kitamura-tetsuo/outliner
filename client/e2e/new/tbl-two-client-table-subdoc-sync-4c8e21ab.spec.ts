import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-53f59906: two-client collaboration on a table subdoc", () => {
    test(
        "a cell edit made by one client is visible to a second client on the same table",
        async ({ browser }, testInfo) => {
            test.setTimeout(240000);
            const projectName = `Table Sync Project ${Date.now()}`;
            const pageName = `table-sync-page-${Date.now()}`;

            const context1 = await browser.newContext();
            const page1 = await context1.newPage();
            await TestHelpers.seedProjectAndNavigate(
                page1,
                testInfo,
                ["Database table demo item"],
                undefined,
                { projectName, pageName, ws: "force" },
            );

            await page1.waitForFunction(
                () => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true,
                null,
                { timeout: 15000 },
            ).catch(() => console.log("page1 not connected yet, continuing"));

            // Create a table on page1 (blank preset: id, title, done).
            await expect(page1.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
            await page1.locator(".outliner-item").first().click();
            await page1.waitForTimeout(300);
            const addDatabaseBtn = page1.getByTestId("main-toolbar").locator(".add-database-btn").last();
            await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
            await addDatabaseBtn.click();
            const createPanel = page1.getByTestId("yjs-table-create-panel").first();
            await expect(createPanel).toBeVisible({ timeout: 10000 });
            await page1.getByTestId("yjs-table-preset-select").first().selectOption("blank");
            await page1.getByTestId("yjs-table-create").first().click();

            const view1 = page1.getByTestId("yjs-table-view").first();
            await expect(view1).toBeVisible({ timeout: 15000 });
            const grid1 = page1.getByTestId("yjs-table-grid").first();
            await expect(grid1.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });

            await page1.getByTestId("yjs-table-add-row").first().click();
            const row1 = grid1.locator("tbody tr").first();
            await expect(row1).toBeVisible({ timeout: 10000 });
            await page1.waitForTimeout(1000);

            const titleCell1 = row1.locator('td[data-col="title"] .cell-value');
            await titleCell1.click();
            const titleInput1 = row1.locator('td[data-col="title"] input');
            await expect(titleInput1).toBeVisible({ timeout: 5000 });
            await titleInput1.fill("Client A entry");
            await titleInput1.press("Enter");
            await expect(
                grid1.locator('td[data-col="title"] .cell-value', { hasText: "Client A entry" }),
            ).toBeVisible({ timeout: 15000 });

            // Second client joins the same page.
            const context2 = await browser.newContext({
                storageState: TestHelpers.createTestStorageState() as any,
            });
            const page2 = await context2.newPage();
            await page2.addInitScript(() => {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("VITE_YJS_FORCE_WS", "true");
                (globalThis as any).__E2E__ = true;
            });
            await page2.goto(page1.url(), { waitUntil: "domcontentloaded" });

            await page2.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__, { timeout: 10000 });
            await page2.evaluate(async () => {
                const mgr = (globalThis as any).__USER_MANAGER__;
                if (mgr?.loginWithEmailPassword) {
                    await mgr.loginWithEmailPassword("test@example.com", "password");
                }
            });
            await page2.waitForFunction(() => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true, null, {
                timeout: 30000,
            }).catch(async () => {
                await page2.reload();
                await TestHelpers.waitForAppReady(page2);
            });
            await TestHelpers.waitForPageData(page2, pageName, 45000);

            // The table subdoc syncs through its own room; the grid on page2
            // should converge on the row created by page1.
            const view2 = page2.getByTestId("yjs-table-view").first();
            await expect(view2).toBeVisible({ timeout: 45000 });
            const grid2 = page2.getByTestId("yjs-table-grid").first();
            await expect(
                grid2.locator('td[data-col="title"] .cell-value', { hasText: "Client A entry" }),
            ).toBeVisible({ timeout: 45000 });

            // Edit the row from page2 and confirm the change flows back to page1.
            const row2 = grid2.locator("tbody tr").first();
            const titleCell2 = row2.locator('td[data-col="title"] .cell-value');
            await titleCell2.click();
            const titleInput2 = row2.locator('td[data-col="title"] input');
            await expect(titleInput2).toBeVisible({ timeout: 5000 });
            await titleInput2.fill("Client B update");
            await titleInput2.press("Enter");

            await expect(
                grid1.locator('td[data-col="title"] .cell-value', { hasText: "Client B update" }),
            ).toBeVisible({ timeout: 30000 });

            await context1.close();
            await context2.close();
        },
    );
});
