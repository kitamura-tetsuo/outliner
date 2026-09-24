import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature PRS-4d2e1b6a
 *  Title   : Yjs cursor presence sync
 *  Source  : docs/client-features/prs-yjs-presence-cursors-4d2e1b6a.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Two independent browser CONTEXTS over the real collaboration transport
// (real auth, real Yjs WebSocket connection, real awareness), asserting the
// actual rendered remote-cursor DOM element in context 2 — not merely that
// both contexts have an `awareness` object. A prior version of this test
// only checked `!!c1.awareness && !!c2.awareness`, which is infrastructure
// existence, not propagation.
test.describe("PRS-4d2e1b6a: cursor presence", () => {
    test(
        "a cursor placed in one browser context renders as a remote cursor in another, and clearing it withdraws it",
        async ({ browser }, testInfo) => {
            test.setTimeout(90000);
            const projectName = `Test Project Cursor Presence ${Date.now()}`;
            const pageName = `prs-presence-page-${Date.now()}`;

            const context1 = await browser.newContext();
            const page1 = await context1.newPage();
            await TestHelpers.seedProjectAndNavigate(
                page1,
                testInfo,
                ["Alpha line", "Beta line"],
                undefined,
                { projectName, pageName, ws: "force" },
            );
            await expect(page1.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
            await page1.waitForFunction(
                () => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true,
                null,
                { timeout: 15000 },
            ).catch(() => {});

            const context2 = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as any });
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
                if (mgr?.loginWithEmailPassword) await mgr.loginWithEmailPassword("test@example.com", "password");
            });
            await page2.waitForFunction(
                () => !!(globalThis as any).__USER_MANAGER__?.getCurrentUser?.(),
                { timeout: 10000 },
            );
            await page2.waitForFunction(
                () => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true,
                null,
                { timeout: 30000 },
            );
            await TestHelpers.waitForPageData(page2, pageName, 30000);
            await expect(page2.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

            // Second context has issued no cursor of its own, so any `.cursor` overlay
            // element it renders can only have arrived over the wire from context 1.
            await expect(page2.locator(".editor-overlay .cursor")).toHaveCount(0);

            const itemId = await page1.locator(".outliner-item").nth(1).getAttribute("data-item-id");
            expect(itemId).toBeTruthy();
            await TestHelpers.setCursor(page1, itemId!, 4, "local");
            await TestHelpers.waitForCursorVisible(page1);

            // Real cross-client propagation: the remote cursor renders in page2's DOM
            // at the same offset, and the store it was rendered from names the same
            // item and a non-local peer.
            const remoteCursor = page2.locator(".editor-overlay .cursor");
            await expect(remoteCursor).toHaveCount(1, { timeout: 20000 });
            await expect(remoteCursor).toHaveAttribute("data-offset", "4");
            const remoteEntry = await page2.evaluate(() => {
                const cursors = (globalThis as any).editorOverlayStore?.cursors ?? {};
                return Object.values(cursors).find((c: any) => c.userId && c.userId !== "local");
            });
            expect(remoteEntry).toMatchObject({ itemId, offset: 4 });

            // Withdrawal: clearing the cursor in context 1 removes the remote cursor
            // from context 2 rather than leaving a stale rendering behind.
            await page1.evaluate(() => (globalThis as any).editorOverlayStore.clearCursorAndSelection("local"));
            await expect(page2.locator(".editor-overlay .cursor")).toHaveCount(0, { timeout: 20000 });

            await context1.close();
            await context2.close();
        },
    );
});
