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
    readWidthGridRegistry,
} from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

// Issue #5457 REQ-007 (AS-004): every placement of the same Grid reflects its
// committed fixed widths after normal synchronization, a separate Grid over
// the same Table stays independent, clearing returns to auto without storing
// a pixel value, and rendering/resizing writes no presentation state.

test.describe("Grid shared placements mirror production width commits", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
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
    });

    test("two placements share widths, a separate Grid stays automatic, reload persists", async ({ page }) => {
        const gridIdA = (await readWidthGridRegistry(page))[0].gridId;
        const tableId = (await readGridProjectState(page)).tables[0].id;
        const baselineData = (await readGridProjectState(page)).tables[0].data;
        const baselineQuery = (await readWidthGridRegistry(page))[0].query;

        // Second placement of Grid A through the normal Existing Grid picker.
        await page.locator(".outliner-item[data-item-id]").last().click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const placePanel = page.getByTestId("yjs-table-create-panel").last();
        await expect(placePanel).toBeVisible();
        await placePanel.getByRole("button", { name: "Existing Grid" }).click();
        await placePanel.getByTestId("yjs-grid-existing-select").selectOption(gridIdA);
        await placePanel.getByTestId("yjs-grid-select-existing").click();
        // A separate Grid B over the same Table through the normal picker.
        await page.locator(".outliner-item[data-item-id]").last().click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const gridPanel = page.getByTestId("yjs-table-create-panel").last();
        await expect(gridPanel).toBeVisible();
        await gridPanel.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await gridPanel.getByTestId("yjs-table-existing-select").selectOption(tableId);
        await gridPanel.getByTestId("yjs-table-select-existing").click();

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });
        const afterCreate = await readWidthGridRegistry(page);
        expect(afterCreate).toHaveLength(2);
        const gridIdB = afterCreate.find((g) => g.gridId !== gridIdA)!.gridId;

        // Commit through the production writer on A's exact handles.
        await commitWidthsProduction(page, gridIdA, { title: 180 });
        await expectFixedWidth(page, 0, "title", 180);
        await expectFixedWidth(page, 1, "title", 180);
        await expectAutoColumn(page, 2, "title");

        // A normal reload keeps A's committed widths in both placements while
        // B stays automatic; source records never change.
        await page.reload();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });
        await expectFixedWidth(page, 0, "title", 180);
        await expectFixedWidth(page, 1, "title", 180);
        await expectAutoColumn(page, 2, "title");
        expect((await readGridProjectState(page)).tables[0].data).toEqual(baselineData);
        const reloaded = await readWidthGridRegistry(page);
        expect(reloaded.find((g) => g.gridId === gridIdA)?.components["title"]?.["widthPx"]).toBe(180);
        expect(reloaded.find((g) => g.gridId === gridIdA)?.query).toBe(baselineQuery);
        expect(reloaded.find((g) => g.gridId === gridIdB)?.components["title"]?.["widthPx"]).toBeUndefined();

        // Rendering and resizing must not write presentation state: observe
        // the Grid registry across viewport changes and require silence.
        await page.evaluate(() => {
            const store =
                (globalThis as unknown as { __YJS_STORE__?: { yjsClient?: { getProject: () => unknown; }; }; })
                    .__YJS_STORE__;
            const project = store?.yjsClient?.getProject() as {
                ydoc: {
                    getMap: (k: string) => {
                        observeDeep: (fn: () => void) => void;
                        unobserveDeep: (fn: () => void) => void;
                    };
                };
            };
            const probe = globalThis as unknown as {
                __widthWriteProbe?: { fires: number; listener: () => void; };
            };
            const listener = () => {
                if (probe.__widthWriteProbe) probe.__widthWriteProbe.fires++;
            };
            probe.__widthWriteProbe = { fires: 0, listener };
            project.ydoc.getMap("yjsGrids").observeDeep(listener);
        });
        const registryBefore = JSON.stringify(await readWidthGridRegistry(page));
        await page.setViewportSize({ width: 1000, height: 800 });
        await page.waitForTimeout(1500);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(1500);
        expect(JSON.stringify(await readWidthGridRegistry(page))).toBe(registryBefore);
        expect(
            await page.evaluate(() =>
                (globalThis as unknown as { __widthWriteProbe?: { fires: number; }; }).__widthWriteProbe?.fires
            ),
        ).toBe(0);
        await expectFixedWidth(page, 0, "title", 180);
        await expectFixedWidth(page, 1, "title", 180);

        // Clearing the override through the production writer returns both
        // shared placements to auto with no replacement pixel value, while
        // records, queries and schema stay intact.
        await commitWidthsProduction(page, gridIdA, { title: undefined });
        await expectAutoColumn(page, 0, "title");
        await expectAutoColumn(page, 1, "title");
        const cleared = await readWidthGridRegistry(page);
        expect(cleared.find((g) => g.gridId === gridIdA)?.components["title"]?.["widthPx"]).toBeUndefined();
        expect((await readGridProjectState(page)).tables[0].data).toEqual(baselineData);
        expect(cleared.find((g) => g.gridId === gridIdA)?.query).toBe(baselineQuery);
    });
});
