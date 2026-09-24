import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DIA-8dbdf16d
 *  Title   : Cross-context Diagram cursor presence
 *  Source  : docs/client-features/dia-cross-context-cursor-sync-8dbdf16d.yaml
 */
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
    clickSourceAt,
    insertDiagram,
    insertTransclusion,
    localCursors,
    readSource,
    seedSource,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * AS-001 (issue #5312), reduced to the part with no prior coverage: TWO
 * independent browser CONTEXTS — two live clients over the real
 * collaboration transport (real auth, real Yjs WebSocket connection, real
 * awareness) — rather than two occurrences driven by one client. Both
 * occurrences of the Diagram live on one page here rather than on separate
 * pages: presence is addressed by `diagramId` alone (`diagramPresenceStore`
 * is never keyed by page or occurrence — see `applyPresenceToOverlay` in
 * `client/src/lib/yjs/service.ts` and `resolvedEntriesFor` in
 * `client/src/stores/DiagramPresenceStore.svelte.ts`), so a second real page
 * for context 2 would exercise the same lookup this test already exercises
 * through a second occurrence, while adding real navigation/timeout risk in
 * this environment. Occurrence independence itself is already covered by
 * `dia-source-navigation-occurrence-a87ece6e.spec.ts` and
 * `dia-multi-cursor-cardinality-8dd8846b.spec.ts` for a single client; what
 * is new here is a second, independent browser client seeing it.
 */

async function connectSecondContext(browser: Browser, page1: Page, pageName: string): Promise<Page> {
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
    await page2.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__?.getCurrentUser?.(), { timeout: 10000 });
    await page2.waitForFunction(
        () => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true,
        null,
        { timeout: 30000 },
    );
    await TestHelpers.waitForPageData(page2, pageName, 30000);
    return page2;
}

test.describe("DIA-8dbdf16d: Diagram cursor presence across independent browser clients", () => {
    test(
        "a remote client's Diagram cursor and edits appear in an occurrence it never touched",
        async ({ browser }, testInfo) => {
            test.setTimeout(120000);
            const projectName = `Test Project Diagram Presence ${Date.now()}`;
            const pageName = `dia-presence-page-${Date.now()}`;

            const context1 = await browser.newContext();
            const page1 = await context1.newPage();
            await TestHelpers.seedProjectAndNavigate(
                page1,
                testInfo,
                ["First target", "Second target"],
                undefined,
                { projectName, pageName, ws: "force" },
            );
            await expect(page1.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

            // Diagram D as occurrence 1 ("First target"), and a transclusion of the
            // same D as occurrence 2 ("Second target") — both created through the
            // production slash-command UI.
            const rows = page1.locator(".outliner-item");
            const { diagramId, occurrenceId: occ1 } = await insertDiagram(page1, rows.nth(1));
            await seedSource(page1, diagramId, "abcde");
            const occ2 = await insertTransclusion(page1, page1.locator(".outliner-item", { hasText: "Second target" }));
            await expect(page1.locator('[data-testid="diagram-block"]')).toHaveCount(2, { timeout: 15000 });

            // User A (context 1) places a caret at a known offset (3) in occurrence 1
            // by clicking directly inside its rendered source (onSourcePointerDown).
            const occ1Source = page1.locator(`[data-item-id="${occ1}"] [data-testid="diagram-source"]`);
            await expect(occ1Source).toHaveText("abcde", { timeout: 15000 });
            const localOffset = 3;
            await clickSourceAt(page1, occ1, localOffset);
            await expect(page1.locator(`[data-item-id="${occ1}"] [data-testid="diagram-caret"]`)).toBeVisible({
                timeout: 10000,
            });
            expect(await localCursors(page1)).toEqual([{ itemId: occ1, offset: localOffset }]);

            // Context 2 joins the same project/page after the caret already exists,
            // so its very first awareness sync must already carry it (issue #5312).
            const page2 = await connectSecondContext(browser, page1, pageName);
            await expect(page2.locator('[data-testid="diagram-block"]')).toHaveCount(2, { timeout: 15000 });

            // Occurrence 2 is the one context 2's user never clicked; it must still
            // show the remote caret, in source mode, addressed by Diagram identity.
            const occ2Block = page2.locator(`[data-item-id="${occ2}"] [data-testid="diagram-block"]`);
            await expect(occ2Block).toHaveAttribute("data-diagram-state", "ready", { timeout: 15000 });
            const occ2Source = page2.locator(`[data-item-id="${occ2}"] [data-testid="diagram-source"]`);
            await expect(occ2Source).toBeVisible({ timeout: 15000 });
            const occ2RemoteCaret = page2.locator(`[data-item-id="${occ2}"] [data-testid="diagram-remote-caret"]`);
            await expect(occ2RemoteCaret).toBeVisible({ timeout: 15000 });
            await expect(occ2RemoteCaret).toHaveAttribute("data-caret-offset", String(localOffset));
            // Not a local caret in context 2: no non-remote caret testid rendered there.
            await expect(page2.locator(`[data-item-id="${occ2}"] [data-testid="diagram-caret"]`)).toHaveCount(0);

            // User A types one character; context 2 must reflect the new canonical
            // text exactly once (not duplicated) without reloading.
            await page1.keyboard.type("X");
            const expected = `${"abcde".slice(0, localOffset)}X${"abcde".slice(localOffset)}`;
            await expect.poll(() => readSource(page1, diagramId)).toBe(expected);
            await expect.poll(() => readSource(page2, diagramId)).toBe(expected);
            await expect(occ2Source).toHaveText(expected, { timeout: 15000 });
            await expect(occ2RemoteCaret).toHaveAttribute("data-caret-offset", String(localOffset + 1));

            await context1.close();
            await page2.context().close();
        },
    );
});
