/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
} from "../utils/crossProjectGridHelpers";
import { commitWidthsProduction, readWidthGridRegistry } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/*
 * Production read-only origin (issue #5458 REQ-005/REQ-007): the outline host
 * enters read-only mode through its supported production mechanism (the shared
 * metadata reset flag observed by OutlinerBase), and that state must reach the
 * numeric Width controls of both a top-level Grid and a Layout-nested Grid.
 * Width mutation becomes unavailable, a pending draft is discarded on the
 * transition, and saved widths plus history stay unchanged.
 */
const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN NOT NULL\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

async function seedLayoutWithGridSlot(page: Page): Promise<void> {
    await page.evaluate(() => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        const gridSlot = layout.items.addNode("e2e-grid-slot");
        gridSlot.columnSpan = 6;
        gridSlot.componentType = "yjstable";
        const neighbor = layout.items.addNode("e2e-neighbor");
        neighbor.columnSpan = 6;
        neighbor.componentType = "calendar";
    });
}

/** A top-level outline Grid view: never inside a layout cell. */
function topLevelView(page: Page) {
    return page.locator(
        'xpath=//*[@data-testid="yjs-table-view" and not(ancestor::*[@data-testid="layout-cell"])]',
    );
}

async function setProductionReadOnly(page: Page, readOnly: boolean): Promise<void> {
    await page.evaluate((locked) => {
        const project = (globalThis as any).generalStore?.project;
        if (!project?.ydoc) throw new Error("Current Yjs project is unavailable");
        const metadata = project.ydoc.getMap("metadata");
        metadata.set("isResetting", locked);
        if (locked) metadata.set("resetStartedAt", Date.now());
    }, readOnly);
}

async function gridIdForSqlName(page: Page, sqlName: string): Promise<string> {
    const state = await readGridProjectState(page);
    const table = state.tables.find((t) => t.sqlName === sqlName);
    if (!table) throw new Error(`no table with SQL name ${sqlName}`);
    const registry = await readWidthGridRegistry(page);
    const grid = registry.find((g) => g.sourceTableId === table.id);
    if (!grid) throw new Error(`no Grid over table ${sqlName}`);
    return grid.gridId;
}

test.describe("Grid numeric widths follow the production read-only origin", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // A normally created top-level Grid with records.
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);

        // A normally created Grid nested in a Layout cell over its own Table.
        await seedLayoutWithGridSlot(page);
        const gridCell = page.getByTestId("layout-cell").nth(0);
        await expect(gridCell).toBeVisible({ timeout: 15000 });
        await gridCell.locator(".component-wrapper").click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const panel = page.getByTestId("yjs-table-create-panel").first();
        await expect(panel).toBeVisible({ timeout: 10000 });
        await panel.getByTestId("yjs-table-name-input").fill("Nested");
        await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
        await panel.getByTestId("yjs-table-sql-name-input").fill("width_layout_orders");
        await panel.getByTestId("yjs-table-create").click();
        const nestedView = gridCell.getByTestId("yjs-table-view");
        await expect(nestedView).toBeVisible({ timeout: 30000 });

        // The Layout renders its outline position first, so the nested view
        // is the first Grid view in the DOM; verify rather than assume.
        const firstIsNested = await page.evaluate(() => {
            const views = [...document.querySelectorAll('[data-testid="yjs-table-view"]')];
            return !!views[0]?.closest?.('[data-testid="layout-cell"]');
        });
        expect(firstIsNested).toBe(true);

        await configureGrid(page, 0, SCHEMA, QUERY, "Nested title");
        await nestedView.getByTestId("yjs-table-add-row").click();
        await expect(nestedView.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(1, {
            timeout: 30000,
        });
        await nestedView.getByTestId("yjs-table-add-row").click();
        await expect(nestedView.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(2, {
            timeout: 30000,
        });

        // Seed saved widths through the production writer, top-level last so
        // it owns the most recent history step for the Undo assertion below.
        await commitWidthsProduction(page, await gridIdForSqlName(page, "width_layout_orders"), {
            title: 200,
        });
        await commitWidthsProduction(page, await gridIdForSqlName(page, "width_orders"), {
            title: 180,
        });
    });

    test("read-only transition disables both placements and preserves state", async ({ page }) => {
        const topView = topLevelView(page);
        const nestedView = page.getByTestId("layout-cell").nth(0).getByTestId("yjs-table-view");
        for (const view of [topView, nestedView]) {
            if (!await view.getByTestId("yjs-table-width-title").isVisible().catch(() => false)) {
                await view.getByTestId("yjs-table-toggle-ui").click();
            }
        }
        const topInput = topView.getByTestId("yjs-table-width-title");
        const nestedInput = nestedView.getByTestId("yjs-table-width-title");
        await expect(topInput).toHaveValue("180", { timeout: 30000 });
        await expect(nestedInput).toHaveValue("200", { timeout: 30000 });
        await expect(topInput).toBeEnabled();
        await expect(nestedInput).toBeEnabled();

        // A pending draft is discarded when the host turns read-only.
        await topInput.fill("240");
        await setProductionReadOnly(page, true);
        await expect(page.locator(".reset-banner")).toBeVisible({ timeout: 10000 });
        await expect(topInput).toBeDisabled({ timeout: 10000 });
        await expect(nestedInput).toBeDisabled();
        await expect(topInput).toHaveValue("180");

        // An attempted commit through the disabled control writes nothing.
        const before = await readWidthGridRegistry(page);
        await topInput.evaluate((el) => {
            const input = el as HTMLInputElement;
            input.value = "999";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            input.blur();
        });
        expect(await readWidthGridRegistry(page)).toEqual(before);
        await expect(topInput).toHaveValue("180");

        // Leaving read-only mode restores editing; the blocked attempt left
        // no history entry, so one Undo reverts the last real width commit.
        await setProductionReadOnly(page, false);
        await expect(page.locator(".reset-banner")).toBeHidden({ timeout: 10000 });
        await expect(topInput).toBeEnabled();
        await expect(nestedInput).toBeEnabled();

        await page.getByTestId("toolbar-undo").click();
        await expect(topInput).toHaveValue("", { timeout: 15000 });
        await expect(nestedInput).toHaveValue("200");
    });
});
