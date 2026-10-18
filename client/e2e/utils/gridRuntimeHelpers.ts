import { expect, type Page, type TestInfo } from "@playwright/test";
import { configureGrid } from "./crossProjectGridHelpers";
import { seedOverlappingTableFixture } from "./gridMutationProvenanceHelpers";

/** Two physical sources with overlapping ids and deliberately different field metadata. */
export async function prepareTypedGridSources(page: Page, testInfo: TestInfo) {
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    const bView = page.getByTestId("yjs-table-view").filter({
        has: page.getByTestId("yjs-table-sql-name").getByText(fixture.tableB.sqlName, { exact: true }),
    });
    const bGridId = await bView.getAttribute("data-grid-id");
    const views = await page.getByTestId("yjs-table-view").all();
    let bIndex = -1;
    for (let index = 0; index < views.length; index++) {
        if (await views[index].getAttribute("data-grid-id") === bGridId) bIndex = index;
    }
    const queryB = `SELECT id AS id, title AS title, done AS done FROM ${fixture.tableB.sqlName}`;
    await configureGrid(
        page,
        bIndex,
        `CREATE TABLE ${fixture.tableB.sqlName} (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK (title IN ('Value from B', 'B changed')), done BOOLEAN)`,
        queryB,
        "Title",
    );
    // The blank preset explicitly chooses text cells. Select the production
    // auto setting to exercise source metadata rather than that saved override.
    await bView.getByTestId("yjs-table-component-title").selectOption("auto");
    await expect(bView.locator('td[data-col="title"] select')).toHaveValue("Value from B");
    const gridId = await fixture.gridA.getAttribute("data-grid-id");
    fixture.gridA = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
    if (!await fixture.gridA.getByTestId("yjs-table-query-input").isVisible()) {
        await fixture.gridA.getByTestId("yjs-table-toggle-ui").click();
    }
    await fixture.gridA.getByTestId("yjs-table-component-title").selectOption("auto");
    return { ...fixture, queryB };
}
