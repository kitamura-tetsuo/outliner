import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5514c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    pointGridAToTableB,
    seedOverlappingTableFixture,
    snapshotProject,
} from "../utils/gridMutationProvenanceHelpers";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";

for (const target of ["Grid", "Table"] as const) {
    for (const direction of ["undo", "redo"] as const) {
        test(
            `${target} ${direction} retains its position and records after standalone ACL revocation`,
            async ({ page }, info) => {
                test.setTimeout(180000);
                const fixture = await seedOverlappingTableFixture(page, info);
                await pointGridAToTableB(page, fixture);
                const gridId = await fixture.gridA.getAttribute("data-grid-id");
                const show = page.getByRole("button", { name: "Show sidebar" });
                if (await show.isVisible()) await show.click();
                await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                    .click();
                await page.getByTestId(`object-row-${gridId}`).locator('[data-testid^="object-open-"]').click();
                const view = page.getByTestId("yjs-table-view");
                const cell = view.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
                await expect(cell.locator("button")).toHaveText("Value from B");
                await view.getByTestId("yjs-table-toggle-ui").click();
                // Isolate setup history before recording both real production operations.
                await page.evaluate(() => (globalThis as any).globalUndoRouter.clear());
                const gridEdit = async () => {
                    const query =
                        `SELECT id AS id, title AS title, done AS done FROM ${fixture.tableB.sqlName} ORDER BY title DESC`;
                    await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(page, query);
                    await expect.poll(async () =>
                        await page.evaluate(
                            id =>
                                (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc.getMap("yjsGrids").get(id)
                                    ?.get("query"),
                            gridId,
                        )
                    )
                        .toBe(query);
                };
                const tableEdit = async () => {
                    await cell.locator("button").click();
                    await cell.locator("input").fill("History B");
                    await cell.locator("input").press("Enter");
                    await expect.poll(async () =>
                        (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)
                            ?.data[fixture.recordId]?.title
                    ).toBe("History B");
                };
                if (target === "Grid") {
                    await tableEdit();
                    await gridEdit();
                } else {
                    await gridEdit();
                    await tableEdit();
                }
                await expect.poll(() => page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(2);
                if (direction === "redo") {
                    await page.getByTestId("toolbar-undo").click();
                    await expect.poll(() => page.evaluate(() => (globalThis as any).globalUndoRouter.redoDepth)).toBe(
                        1,
                    );
                }
                const snapshot = async () => {
                    const project = await snapshotProject(page);
                    const history = await page.evaluate(() => {
                        const router = (globalThis as any).globalUndoRouter;
                        return { undo: router.undoDepth, redo: router.redoDepth };
                    });
                    return {
                        grids: await page.evaluate(() =>
                            (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc.getMap("yjsGrids").toJSON()
                        ),
                        tables: project.tables.map(table => ({ id: table.id, data: table.data })),
                        history,
                    };
                };
                const before = await snapshot();
                const projectId = (await snapshotProject(page)).guid;
                const response = await page.request.patch(
                    `http://127.0.0.1:58080/v1/projects/outliner-d57b0/databases/(default)/documents/projectUsers/${projectId}?updateMask.fieldPaths=accessibleUserIds`,
                    {
                        headers: { Authorization: "Bearer owner" },
                        data: { fields: { accessibleUserIds: { arrayValue: { values: [] } } } },
                    },
                );
                expect(response.ok()).toBe(true);
                await page.evaluate(() => (globalThis as any).__PROJECT_STORE__.refresh());
                await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
                await expect(view).toHaveCount(0);
                await page.getByTestId(`toolbar-${direction}`).click();
                expect(await snapshot()).toEqual(before);
            },
        );
    }
}
