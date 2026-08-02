import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Alias UI two-client sync", () => {
    test("alias UI updates without advancing timers on second client", async ({ browser }, testInfo) => {
        test.setTimeout(120000);
        const projectName = `Alias Sync Project ${Date.now()}`;
        const pageName = `Alias-sync-page-${Date.now()}`;

        const context1 = await browser.newContext();
        const page1 = await context1.newPage();

        // Client 1 sets up the project
        await TestHelpers.seedProjectAndNavigate(
            page1,
            testInfo,
            ["Target Item"],
            undefined,
            { projectName, pageName, ws: "force" },
        );

        await page1.waitForFunction(
            () => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true,
            null,
            { timeout: 15000 }
        ).catch(() => console.log("page1 not connected yet, continuing"));

        const targetId = await TestHelpers.getItemIdByIndex(page1, 1);
        expect(targetId).toBeTruthy();

        // Second client joins the same project
        const context2 = await browser.newContext({
            storageState: TestHelpers.createTestStorageState() as any,
        });
        const page2 = await context2.newPage();
        await page2.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
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

        await page2.waitForFunction(
            (targetId) => !!document.querySelector(`.outliner-item[data-id="${targetId}"]`),
            targetId,
            { timeout: 45000 }
        ).catch(() => console.log("Failed to wait for target item on page 2"));
        await TestHelpers.waitForPageData(page2, pageName, 10000).catch(() => console.log("ignore wait for pagedata"));

        // Wait for page2 target item to be fully visible
        const p2Target = page2.locator(`.outliner-item[data-id="${targetId}"]`);
        await expect(p2Target).toBeAttached({ timeout: 15000 }).catch(() => console.log("ignore attachment"));

        // Now client 1 will add an alias to target item.
        await page1.evaluate(async (tid) => {
            const w = globalThis as any;
            const appStore = w.appStore;
            if (appStore && appStore.currentPage && appStore.currentPage.items) {
                // items is an Array-like object in yjs-schema AppItem
                const items = appStore.currentPage.items;
                const source = typeof items.at === "function" ? items.at(1) : items[1];
                if (source) source.aliasTargetId = tid;
            }
        }, targetId);

        // Check if client 1 has alias
        await expect(page1.locator('.referring-aliases-container').first()).toBeVisible({ timeout: 10000 });

        // Check client 2 receives the alias immediately (timeout <= 2000, avoiding 5-second polling)
        await expect(page2.locator('.referring-aliases-container').first()).toBeVisible({ timeout: 2000 });

        await context1.close();
        await context2.close();
    });
});
