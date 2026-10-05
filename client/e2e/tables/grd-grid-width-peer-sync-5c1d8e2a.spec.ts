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
    expectAutoColumn,
    expectFixedWidth,
    placementColumnWidths,
    readWidthGridRegistry,
} from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

// Issue #5457 REQ-007 (AS-004): a width committed through the production
// writer on one client is observed by another client through normal
// synchronization, with geometry to match.
test.describe("Grid width commits synchronize to a second client", () => {
    test("a peer observes fixed widths and the later clear", async ({ page, browser }, testInfo) => {
        test.setTimeout(240000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const setupView = page.getByTestId("yjs-table-view").first();
        if (!await setupView.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await setupView.getByTestId("yjs-table-toggle-ui").click();
        }
        await setupView.getByTestId("yjs-table-hidden-done").check();
        const gridId = (await readWidthGridRegistry(page))[0].gridId;
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
                {
                    timeout: 30000,
                },
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

            await commitWidthsProduction(page, gridId, { title: 180, done: 48 });
            await expectFixedWidth(page, 0, "title", 180);
            await expect
                .poll(async () => (await placementColumnWidths(peer, 0, "title"))[0], { timeout: 90000 })
                .toBeLessThanOrEqual(181);
            await expectFixedWidth(peer, 0, "title", 180);
            await expectFixedWidth(peer, 0, "done", 48);
            expect(
                (await readWidthGridRegistry(peer)).find((g) => g.gridId === gridId)?.components["title"]?.["widthPx"],
            ).toBe(180);
            expect((await readGridProjectState(peer)).tables[0].data).toEqual(baselineData);

            await commitWidthsProduction(page, gridId, { title: undefined, done: undefined });
            await expect
                .poll(
                    async () =>
                        (await readWidthGridRegistry(peer)).find((g) => g.gridId === gridId)?.components["title"]?.[
                            "widthPx"
                        ],
                    { timeout: 90000 },
                )
                .toBeUndefined();
            await expectAutoColumn(peer, 0, "title");
            await expectAutoColumn(page, 0, "title");
            expect((await readGridProjectState(peer)).tables[0].data).toEqual(baselineData);
        } finally {
            await peerContext.close();
        }
    });
});
