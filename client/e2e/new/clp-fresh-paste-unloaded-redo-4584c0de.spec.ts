/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    copyGridHosts,
    createBlankGrid,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

for (const queryOnly of [false, true]) {
    test(`fresh Copy replays exact state with its source unloaded; queryOnly=${queryOnly}`, async ({ page }, info) => {
        test.setTimeout(180000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const fixture = await seedCrossProjectFixture(page, info);
        await createBlankGrid(page, "Saved source", "saved_source");
        await addSourceRecord(page);
        if (queryOnly) {
            const view = page.getByTestId("yjs-table-view");
            await view.getByTestId("yjs-table-toggle-ui").click();
            await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(
                page,
                "SELECT 1 AS value",
            );
            await expect.poll(async () => (await readGridProjectState(page)).grids[0].query).toBe("SELECT 1 AS value");
        }
        if (!queryOnly) {
            const table = (await readGridProjectState(page)).tables[0].id;
            await page.getByTestId("grid-insert-preference-open").click();
            await page.getByTestId("grid-insert-preference-select").selectOption(table);
            await page.getByTestId("grid-insert-preference-apply").click();
            await expect.poll(async () => (await readGridProjectState(page)).grids[0].insertTargetTableId).toBe(table);
        }
        const source = await readGridProjectState(page);
        await page.evaluate(() => navigator.clipboard.writeText(""));
        await copyGridHosts(page);
        const destination = await page.context().newPage();
        try {
            await destination.goto(
                `${new URL(page.url()).origin}/${encodeURIComponent(fixture.destinationProject)}/${
                    encodeURIComponent(fixture.destinationPage)
                }`,
            );
            await expect(destination.locator(".outliner-item[data-item-id]")).toHaveCount(2);
            await createBlankGrid(destination, "Keep", "keep");
            const before = await readGridProjectState(destination);
            const sourceLoaded = () =>
                destination.evaluate(async id => {
                    const path = "/src/lib/yjsService.svelte.ts";
                    const { getLoadedProjectDocById } = await import(/* @vite-ignore */ path);
                    return getLoadedProjectDocById(id) !== undefined;
                }, fixture.sourceProjectId);
            expect(await sourceLoaded()).toBe(false);
            await destination.bringToFront();
            await pasteAtAnchor(destination, 2);
            await expect.poll(sourceLoaded).toBe(false);
            const saved = await readGridProjectState(destination);
            const grid = saved.grids.find(grid => !before.grids.some(other => other.id === grid.id))!;
            expect(grid.query).toBe(source.grids[0].query);
            expect(saved.tables).toHaveLength(queryOnly ? 1 : 2);
            if (!queryOnly) {
                const table = saved.tables.find(table => !before.tables.some(other => other.id === table.id))!;
                expect(table.data).toEqual(source.tables[0].data);
                expect(grid.insertTargetTableId).toBe(table.id);
            }
            await destination.getByTestId("toolbar-undo").click();
            await expect.poll(() => readGridProjectState(destination)).toEqual(before);
            await destination.getByTestId("toolbar-redo").click();
            await expect.poll(() => readGridProjectState(destination)).toEqual(saved);
            expect(await sourceLoaded()).toBe(false);
            expect(await readGridProjectState(page)).toEqual(source);
        } finally {
            await destination.close();
        }
    });
}
