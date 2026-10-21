/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test(
    "Object Manager Delete/Undo preserves ordinary Paste reuse and destination presentation",
    async ({ page }, info) => {
        test.setTimeout(180000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const fixture = await seedCrossProjectFixture(page, info);
        await createBlankGrid(page, "Source", "source_records");
        await addSourceRecord(page);
        const source = await readGridProjectState(page);
        await copyGridHosts(page);
        await openProjectPage(page, fixture, "destination");
        await pasteAtAnchor(page, 1);
        const id = (await readGridProjectState(page)).grids[0].id;
        // Accepted Project-local presentation edits, independent of copied SQL/data.
        await page.evaluate(id => {
            const entry = (globalThis as any).generalStore.project.ydoc.getMap("yjsGrids").get(id);
            entry.set("name", "Destination settings");
            entry.set("showAddRowButton", false);
            (globalThis as any).__deletedGridEntry = entry;
        }, id);
        const before = await readGridProjectState(page);
        const show = page.getByRole("button", { name: "Show sidebar" });
        if (await show.isVisible()) await show.click();
        await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
        await page.getByTestId(`object-delete-${id}`).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
        await expect(page.getByTestId(`object-delete-${id}`)).toHaveCount(0);
        await page.goBack();
        await page.getByTestId("toolbar-undo").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(1);
        expect(await readGridProjectState(page)).toEqual(before);
        expect(
            await page.evaluate(id => {
                const globals = globalThis as any;
                const entry = globals.generalStore.project.ydoc.getMap("yjsGrids").get(id);
                return {
                    project: entry.get("copiedFromProjectId"),
                    grid: entry.get("copiedFromGridId"),
                    newIncarnation: entry !== globals.__deletedGridEntry,
                };
            }, id),
        ).toEqual({ project: fixture.sourceProjectId, grid: source.grids[0].id, newIncarnation: true });
        await pasteAtAnchor(page, 2);
        const repeated = await readGridProjectState(page);
        expect(repeated.grids).toEqual(before.grids);
        expect(repeated.tables).toEqual(before.tables);
        expect(repeated.hostGridIds).toEqual([id, id]);
        expect(repeated.placements.some(p => p.id === before.placements[0].id)).toBe(true);
        await openProjectPage(page, fixture, "source");
        expect(await readGridProjectState(page)).toEqual(source);
    },
);
