/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
} from "../utils/crossProjectGridHelpers";
import {
    commitWidthsProduction,
    expectFixedWidth,
    readWidthGridRegistry,
    singleGridId,
} from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Numeric width drafts against live shared state (issue #5458 REQ-007):
 * a pending numeric draft is cancelled through the real YjsTableView
 * mirror when a connected peer commits the same column, while a disjoint
 * peer update preserves the draft. Numeric commits cross the production
 * presentation read (shared registry), measured header/body geometry,
 * Undo/Redo and reload. Widths originate from real UI gestures and the
 * peer writer; nothing is injected by re-rendering props directly.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

test.describe("Grid numeric width drafts observe peer state", () => {
    test("same-column peer commit cancels the draft; disjoint updates survive", async ({ page, browser }, testInfo) => {
        test.setTimeout(240000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const view = page.getByTestId("yjs-table-view").first();
        if (!await view.getByTestId("yjs-table-width-title").isVisible().catch(() => false)) {
            await view.getByTestId("yjs-table-toggle-ui").click();
        }
        const widthInput = view.getByTestId("yjs-table-width-title");
        await expect(widthInput).toBeVisible({ timeout: 30000 });

        // Real numeric commit through the UI editor: the production
        // presentation read (shared registry) plus measured geometry.
        await widthInput.fill("180");
        await widthInput.press("Enter");
        await expect(widthInput).toHaveValue("180");
        await expectFixedWidth(page, 0, "title", 180);
        const gridId = await singleGridId(page);
        expect((await readWidthGridRegistry(page)).find((g) => g.gridId === gridId)?.components["title"]?.["widthPx"])
            .toBe(180);
        const baselineData = (await readGridProjectState(page)).tables[0].data;

        const peerContext = await browser.newContext({
            storageState: TestHelpers.createTestStorageState() as never,
        });
        try {
            const peer = await peerContext.newPage();
            await peer.addInitScript(() => {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                (globalThis as unknown as { __E2E__?: boolean; }).__E2E__ = true;
            });
            await peer.goto(page.url(), { waitUntil: "domcontentloaded" });
            await peer.waitForFunction(
                () => !!(globalThis as unknown as { __USER_MANAGER__?: unknown; }).__USER_MANAGER__,
                { timeout: 30000 },
            );
            await peer.evaluate(async () => {
                const manager = (globalThis as unknown as {
                    __USER_MANAGER__?: { loginWithEmailPassword?: (u: string, p: string) => Promise<void>; };
                }).__USER_MANAGER__;
                await manager?.loginWithEmailPassword?.("test@example.com", "password");
            });
            await peer.waitForFunction(
                () =>
                    (globalThis as unknown as { __YJS_STORE__?: { getIsConnected?: () => boolean; }; }).__YJS_STORE__
                        ?.getIsConnected?.() === true,
                { timeout: 60000 },
            );
            await expect(peer.getByTestId("yjs-table-grid").locator('th[data-col="title"]')).toBeVisible({
                timeout: 60000,
            });

            // Leave a dirty draft pending over saved 180, then let the peer
            // commit the same column through the production writer. Normal
            // Yjs observation must cancel the stale draft in the mounted
            // editor: the input shows the new shared value with a notice.
            await widthInput.fill("240");
            await commitWidthsProduction(peer, gridId, { title: 210 });
            await expect(widthInput).toHaveValue("210", { timeout: 60000 });
            await expect(view.getByTestId("yjs-table-width-notice-title")).toBeVisible({ timeout: 30000 });
            await expectFixedWidth(page, 0, "title", 210);

            // Enter followed by blur after cancellation writes nothing: no
            // Yjs update, saved state and geometry unchanged.
            const beforeCancel = await readWidthGridRegistry(page);
            await page.evaluate(() => {
                (globalThis as unknown as { __E2E_UPDATE_COUNT__?: number; }).__E2E_UPDATE_COUNT__ = 0;
                const store = (globalThis as unknown as {
                    __YJS_STORE__?: {
                        yjsClient?: { getProject: () => { ydoc: { on: (e: string, f: () => void) => void; }; }; };
                    };
                }).__YJS_STORE__;
                store?.yjsClient?.getProject()?.ydoc?.on("update", () => {
                    const g = globalThis as unknown as { __E2E_UPDATE_COUNT__?: number; };
                    g.__E2E_UPDATE_COUNT__ = (g.__E2E_UPDATE_COUNT__ ?? 0) + 1;
                });
            });
            await widthInput.press("Enter");
            await widthInput.evaluate((e) => (e as HTMLInputElement).blur());
            expect(
                await page.evaluate(
                    () => (globalThis as unknown as { __E2E_UPDATE_COUNT__?: number; }).__E2E_UPDATE_COUNT__ ?? -1,
                ),
            ).toBe(0);
            expect(await readWidthGridRegistry(page)).toEqual(beforeCancel);
            await expectFixedWidth(page, 0, "title", 210);

            // A disjoint peer update (another column width plus a label)
            // preserves the pending draft; the local commit keeps both.
            await widthInput.fill("260");
            await commitWidthsProduction(peer, gridId, { quantity: 64 });
            const peerView = peer.getByTestId("yjs-table-view").first();
            if (!await peerView.getByTestId("yjs-table-label-quantity").isVisible().catch(() => false)) {
                await peerView.getByTestId("yjs-table-toggle-ui").click();
            }
            const peerLabel = peerView.getByTestId("yjs-table-label-quantity");
            await expect(peerLabel).toBeVisible({ timeout: 30000 });
            await peerLabel.fill("Qty");
            await peerLabel.press("Tab");
            await expect(view.getByTestId("yjs-table-width-notice-title")).toBeHidden({ timeout: 60000 });
            await expect(widthInput).toHaveValue("260");
            await widthInput.press("Enter");
            await expect(widthInput).toHaveValue("260");
            await expectFixedWidth(page, 0, "title", 260);
            await expectFixedWidth(page, 0, "quantity", 64);
            const registry = await readWidthGridRegistry(page);
            expect(registry.find((g) => g.gridId === gridId)?.components["title"]?.["widthPx"]).toBe(260);
            expect(registry.find((g) => g.gridId === gridId)?.components["quantity"]?.["widthPx"]).toBe(64);
            expect(registry.find((g) => g.gridId === gridId)?.components["quantity"]?.["label"]).toBe("Qty");
            expect((await readGridProjectState(page)).tables[0].data).toEqual(baselineData);

            // Undo/Redo cross the shared history, then reload persists.
            await page.getByTestId("toolbar-undo").click();
            await expect(widthInput).toHaveValue("210", { timeout: 30000 });
            await expectFixedWidth(page, 0, "title", 210);
            await expectFixedWidth(page, 0, "quantity", 64);
            await page.getByTestId("toolbar-redo").click();
            await expect(widthInput).toHaveValue("260", { timeout: 30000 });
            await expectFixedWidth(page, 0, "title", 260);
            await page.reload();
            await expect(page.getByTestId("yjs-table-grid").locator('th[data-col="title"]')).toBeVisible({
                timeout: 60000,
            });
            await expectFixedWidth(page, 0, "title", 260);
            await expectFixedWidth(page, 0, "quantity", 64);
        } finally {
            await peerContext.close();
        }
    });
});
