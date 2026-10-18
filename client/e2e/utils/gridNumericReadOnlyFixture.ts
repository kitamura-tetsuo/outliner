import { expect, type Page, type TestInfo } from "@playwright/test";
import { addSourceRecord, configureGrid, createBlankGrid } from "./crossProjectGridHelpers";
import { commitWidthsProduction } from "./gridWidthHelpers";
import { TestHelpers } from "./testHelpers";

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN NOT NULL\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
// Every Table of a project is materialized into one shared Postgres schema
// under its schema's relation name, so the Layout-nested Grid needs its own
// relation: reusing `orders` would make its query read the top-level Grid's
// records instead of its own fresh dataset.
const NESTED_SCHEMA = "CREATE TABLE nested_orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN NOT NULL\n)";
const NESTED_QUERY = "SELECT id, title, quantity, done FROM nested_orders";

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
export function topLevelView(page: Page) {
    return page.locator(
        'xpath=//*[@data-testid="yjs-table-view" and not(ancestor::*[@data-testid="layout-cell"])]',
    );
}

export async function setProductionReadOnly(page: Page, readOnly: boolean): Promise<void> {
    await page.evaluate((locked) => {
        const project = (globalThis as any).generalStore?.project;
        if (!project?.ydoc) throw new Error("Current Yjs project is unavailable");
        const metadata = project.ydoc.getMap("metadata");
        metadata.set("isResetting", locked);
        if (locked) metadata.set("resetStartedAt", Date.now());
    }, readOnly);
}

export async function prepareNumericReadOnlyGrids(page: Page, testInfo: TestInfo): Promise<void> {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
    await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

    // A normally created top-level Grid with records.
    await createBlankGrid(page, "Widths", "width_orders");
    await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
    await addSourceRecord(page);
    await addSourceRecord(page, 0, 2);
    const topGridId = await topLevelView(page).getAttribute("data-grid-id");
    expect(topGridId).toBeTruthy();

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
    const nestedGridId = await nestedView.getAttribute("data-grid-id");
    expect(nestedGridId).toBeTruthy();

    // The Layout renders its outline position first, so the nested view
    // is the first Grid view in the DOM; verify rather than assume.
    const firstIsNested = await page.evaluate(() => {
        const views = [...document.querySelectorAll('[data-testid="yjs-table-view"]')];
        return !!views[0]?.closest?.('[data-testid="layout-cell"]');
    });
    expect(firstIsNested).toBe(true);

    await configureGrid(page, 0, NESTED_SCHEMA, NESTED_QUERY, "Nested title");
    await nestedView.getByTestId("yjs-table-add-row").click();
    await expect(nestedView.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(1, {
        timeout: 30000,
    });
    await nestedView.getByTestId("yjs-table-add-row").click();
    await expect(nestedView.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(2, {
        timeout: 30000,
    });

    // Actual Grid identities survive schema SQL-name changes and Layout placement.
    // Top-level last owns the history step checked by the Undo assertion.
    await commitWidthsProduction(page, nestedGridId!, { title: 200 });
    await commitWidthsProduction(page, topGridId!, { title: 180 });
}
