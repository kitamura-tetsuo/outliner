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
    expectColumnGeometry,
    gridRevisions,
    headerWidth,
    installWriteProbe,
    pressResizeHandle,
    readWriteProbe,
} from "../utils/gridResizeHelpers";
import { expectAutoColumn, readWidthGridRegistry } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Header drag resizing (issue #5459 AS-001, REQ-001..003/006..008): a real
 * mouse drag on the dedicated handle previews locally with no saved effect,
 * and the release outside the header commits exactly one shared width that
 * every placement, the numeric settings, the production presentation
 * revision, reload and toolbar Undo/Redo agree on. A separate Grid over the
 * same Table stays unchanged; records and the query revision never change.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
const PROJECT = "drag-commit-project";

test.describe("Grid header drag resize commits once on release", () => {
    test("preview has no saved effect; release has exactly one", async ({ page }, testInfo) => {
        test.setTimeout(240000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const gridIdA = (await readWidthGridRegistry(page))[0].gridId;
        const tableId = (await readGridProjectState(page)).tables[0].id;

        // Second placement of Grid A, then Grid B over the same Table.
        await page.locator(".outliner-item[data-item-id]").last().click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const placePanel = page.getByTestId("yjs-table-create-panel").last();
        await placePanel.getByRole("button", { name: "Existing Grid" }).click();
        await placePanel.getByTestId("yjs-grid-existing-select").selectOption(gridIdA);
        await placePanel.getByTestId("yjs-grid-select-existing").click();
        await page.locator(".outliner-item[data-item-id]").last().click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const gridPanel = page.getByTestId("yjs-table-create-panel").last();
        await gridPanel.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await gridPanel.getByTestId("yjs-table-existing-select").selectOption(tableId);
        await gridPanel.getByTestId("yjs-table-select-existing").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });
        const gridIdB = (await readWidthGridRegistry(page)).find((g) => g.gridId !== gridIdA)!.gridId;

        const view = page.getByTestId("yjs-table-view").first();
        if (!await view.getByTestId("yjs-table-width-title").isVisible().catch(() => false)) {
            await view.getByTestId("yjs-table-toggle-ui").click();
        }
        const widthInput = view.getByTestId("yjs-table-width-title");
        await expect(widthInput).toHaveValue("");
        await expectAutoColumn(page, 0, "title");

        const baselineData = (await readGridProjectState(page)).tables[0].data;
        const before = await gridRevisions(page, PROJECT, gridIdA);
        const beforeB = await gridRevisions(page, PROJECT, gridIdB);
        await installWriteProbe(page);
        const probeStart = await readWriteProbe(page);

        // Real drag from the measured auto width through several candidates.
        const start = await headerWidth(page, 0, "title");
        const dx = Math.round(217 - start);
        const press = await pressResizeHandle(page, 0, "title");
        for (const step of [12, Math.round(dx / 2) + 30, Math.round(dx / 2)]) {
            await page.mouse.move(press.x + step, press.y, { steps: 3 });
        }
        const mid = Math.round(start + Math.round(dx / 2));
        await expectColumnGeometry(page, 0, "title", mid);
        await expect(widthInput).toHaveValue(String(mid));
        await expect(widthInput).toHaveAttribute("data-width-preview", "unsaved");
        await expect(view.getByTestId("yjs-table-width-preview-title")).toBeVisible();
        // Withheld pointerup: no width-related update, no history entry, and
        // other placements still show the committed (auto) width.
        const during = await readWriteProbe(page);
        expect(during.registry).toBe(0);
        expect(during.undoDepth).toBe(probeStart.undoDepth);
        await expectAutoColumn(page, 1, "title");
        await expectAutoColumn(page, 2, "title");
        expect((await readWidthGridRegistry(page)).find((g) => g.gridId === gridIdA)?.components["title"]?.["widthPx"])
            .toBeUndefined();

        // Release away from the original header (below the Grid).
        await page.mouse.move(press.x + dx, press.y + 260, { steps: 4 });
        await page.mouse.up();

        await expect.poll(async () =>
            (await readWidthGridRegistry(page)).find((g) => g.gridId === gridIdA)?.components["title"]?.["widthPx"]
        ).toBe(217);
        const after = await readWriteProbe(page);
        expect(after.registry).toBe(1);
        expect(after.undoDepth).toBe(probeStart.undoDepth + 1);
        await expectColumnGeometry(page, 0, "title", 217);
        await expectColumnGeometry(page, 1, "title", 217);
        await expectAutoColumn(page, 2, "title");
        await expect(widthInput).toHaveValue("217");
        await expect(widthInput).not.toHaveAttribute("data-width-preview", "unsaved");
        await expect(view.getByTestId("yjs-table-width-preview-title")).toBeHidden();
        // Release selected nothing.
        await expect(view.locator('th[data-col="title"]')).not.toHaveClass(/header-selected/);

        const revised = await gridRevisions(page, PROJECT, gridIdA);
        expect(revised.presentation).not.toBe(before.presentation);
        expect(revised.query).toBe(before.query);
        expect(revised.entry.columnOrder).toEqual(before.entry.columnOrder);
        expect(await gridRevisions(page, PROJECT, gridIdB)).toEqual(beforeB);
        expect((await readGridProjectState(page)).tables[0].data).toEqual(baselineData);

        // The second placement's numeric settings show the saved width.
        const view1 = page.getByTestId("yjs-table-view").nth(1);
        await view1.getByTestId("yjs-table-toggle-ui").click();
        await expect(view1.getByTestId("yjs-table-width-title")).toHaveValue("217");

        // One toolbar Undo restores auto (absent), Redo reapplies 217.
        await page.getByTestId("toolbar-undo").click();
        await expect(widthInput).toHaveValue("");
        await expectAutoColumn(page, 0, "title");
        await expectAutoColumn(page, 1, "title");
        expect((await gridRevisions(page, PROJECT, gridIdA)).presentation).toBe(before.presentation);
        await page.getByTestId("toolbar-redo").click();
        await expect(widthInput).toHaveValue("217");
        await expectColumnGeometry(page, 0, "title", 217);

        // Normal reload keeps the committed width, not any transient state.
        await page.reload();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });
        await expectColumnGeometry(page, 0, "title", 217);
        await expectColumnGeometry(page, 1, "title", 217);
        await expectAutoColumn(page, 2, "title");
        expect((await readGridProjectState(page)).tables[0].data).toEqual(baselineData);
        expect((await gridRevisions(page, PROJECT, gridIdA)).presentation).toBe(revised.presentation);
    });
});
