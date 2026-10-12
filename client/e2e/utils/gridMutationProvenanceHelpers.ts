import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    copyGridHosts,
    createBlankGrid,
    type GridProjectState,
    type GridTableState,
    openPasteSpecialAtAnchor,
    readGridProjectState,
    setCellValue,
} from "./crossProjectGridHelpers";
import { SqlEditorHelper } from "./sqlEditorHelpers";
import { TestHelpers } from "./testHelpers";

const SCHEMA = "CREATE TABLE table_a (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  done BOOLEAN\n)";
const QUERY_A = "SELECT id, title, done FROM table_a";

export interface OverlappingTableFixture {
    projectName: string;
    recordId: string;
    tableA: GridTableState;
    tableB: GridTableState;
    gridA: Locator;
}

function gridForSqlName(page: Page, sqlName: string): Locator {
    const escapedSqlName = sqlName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return page.getByTestId("yjs-table-view").filter({
        has: page.getByTestId("yjs-table-sql-name").filter({ hasText: new RegExp(`^${escapedSqlName}$`) }),
    });
}

/**
 * Build two independent Tables through the production create/copy writers.
 * Copy-with-data deliberately preserves the source record ids, which gives
 * this provenance regression two same-shaped Tables with an overlapping id
 * without writing fixture data directly into Yjs.
 */
export async function seedOverlappingTableFixture(
    page: Page,
    testInfo: TestInfo,
): Promise<OverlappingTableFixture> {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Grid provenance anchor"]);
    await createBlankGrid(page, "Table A", "table_a");
    await configureGrid(page, 0, SCHEMA, QUERY_A, "Title");
    await addSourceRecord(page);

    let state = await readGridProjectState(page);
    const originalA = state.tables.find(table => table.sqlName === "table_a")!;
    const recordId = Object.keys(originalA.data)[0];
    await setCellValue(page, 0, recordId, "title", "Value from A");

    await copyGridHosts(page);
    await openPasteSpecialAtAnchor(page);
    await page.getByTestId("paste-special-copy-with-data").click();
    await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });

    state = await readGridProjectState(page);
    const tableA = state.tables.find(table => table.id === originalA.id)!;
    const tableB = state.tables.find(table => table.id !== originalA.id)!;
    expect(Object.keys(tableB.data)).toEqual([recordId]);

    const gridB = gridForSqlName(page, tableB.sqlName);
    const bIndex = await page.getByTestId("yjs-table-view").all().then(async views => {
        for (let index = 0; index < views.length; index++) {
            if (await views[index].getAttribute("data-grid-id") === await gridB.getAttribute("data-grid-id")) {
                return index;
            }
        }
        throw new Error("Copied Table B Grid was not rendered");
    });
    await setCellValue(page, bIndex, recordId, "title", "Value from B");

    return { projectName, recordId, tableA, tableB, gridA: gridForSqlName(page, tableA.sqlName) };
}

export async function pointGridAToTableB(page: Page, fixture: OverlappingTableFixture): Promise<void> {
    const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
    await queryEditor.fillAndCommit(
        page,
        `SELECT id, title, done FROM ${fixture.tableB.sqlName}`,
    );
    const grid = fixture.gridA.getByTestId("yjs-table-grid");
    // A refused result deliberately withholds a writable recordId from its
    // cells. Locate the displayed B row by its distinguishable value instead
    // of assuming that read-only DOM carries write-addressing metadata.
    await expect(grid.locator("tbody tr").filter({ hasText: "Value from B" })).toBeVisible({
        timeout: 30000,
    });
    await expect(grid.getByTestId("grid-readonly-reason")).toContainText("not the Grid's source Table");
}

export async function snapshotProject(page: Page): Promise<GridProjectState> {
    return await readGridProjectState(page);
}
