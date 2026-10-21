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
import { transferHistory } from "../utils/mixedTransferHistory";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (const fresh of [false, true]) {
    test(
        `mixed Calendar/Grid clipboard uses admitted reused and fresh Table IDs: fresh=${fresh}`,
        async ({ page }, info) => {
            test.setTimeout(180000);
            await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
            const fixture = await seedCrossProjectFixture(page, info);
            await createBlankGrid(page, "A", "a");
            await copyGridHosts(page);
            await openProjectPage(page, fixture, "destination");
            await createBlankGrid(page, "Unrelated A", "a");
            await addSourceRecord(page);
            if (fresh) {
                await createBlankGrid(page, "Unrelated B", "b");
                await addSourceRecord(page, 1);
            }
            await pasteAtAnchor(page, fresh ? 3 : 2);
            const first = await readGridProjectState(page);
            const reused = first.tables.find(table => table.sqlName === "a_2")!;
            expect(reused).toBeDefined();
            const existingGrid = first.grids.find(grid => grid.name === "A")!;
            await openProjectPage(page, fixture, "source");
            await createBlockFromItem(page, page.locator(".outliner-item[data-item-id]").nth(2), "Calendar");
            await page.getByTestId("calendar-name-input").fill("Mixed Calendar");
            await page.getByTestId("calendar-create").click();
            await expect(page.getByTestId("calendar-view")).toHaveCount(1);
            if (fresh) await createBlankGrid(page, "B", "b");
            const query = fresh ? "SELECT a.id AS id FROM a JOIN b ON a.id = b.id" : "SELECT id AS id FROM a";
            await page.evaluate(query => {
                const doc = (globalThis as any).generalStore.project.ydoc;
                const calendar = [...doc.getMap("calendars").values()][0] as any;
                calendar.set("query", query);
                calendar.set("timezone", "Asia/Tokyo");
                calendar.set("roleTitle", "id");
            }, query);
            const source = await readGridProjectState(page);
            // Calendar was inserted before A; this real selection covers Calendar and both Grids.
            await copyGridHosts(page);
            await openProjectPage(page, fixture, "destination");
            const before = await readGridProjectState(page);
            const historyBefore = await transferHistory(page);
            await pasteAtAnchor(page, fresh ? 5 : 3);
            await expect(page.getByTestId("calendar-view")).toHaveCount(1);
            const after = await readGridProjectState(page);
            const calendar = await page.evaluate(() => {
                const doc = (globalThis as any).generalStore.project.ydoc;
                return ([...doc.getMap("calendars").values()][0] as any).toJSON();
            });
            expect(calendar.query).toBe(
                fresh ? "SELECT a_2.id AS id FROM a_2 JOIN b_2 ON a_2.id = b_2.id" : "SELECT id AS id FROM a_2",
            );
            expect(calendar.name).toBe("Mixed Calendar");
            expect(calendar.timezone).toBe("Asia/Tokyo");
            expect(calendar.roleTitle).toBe("id");
            expect(after.grids.find(grid => grid.id === existingGrid.id)?.query).toBe(
                source.grids.find(grid => grid.name === "A")!.query.replace(/\ba\b/g, "a_2"),
            );
            expect(after.tables.find(table => table.sqlName === "a_2")?.id).toBe(reused.id);
            expect(after.tables).toHaveLength(fresh ? 4 : 2);
            for (const table of before.tables) expect(after.tables.find(value => value.id === table.id)).toEqual(table);
            const pastedHistory = await transferHistory(page);
            expect(pastedHistory.positions).toEqual([
                historyBefore.positions[0] + 1,
                0,
                historyBefore.positions[2] + 1,
                0,
                ...historyBefore.positions.slice(4),
            ]);
            const calendarSnapshot = await page.evaluate(() =>
                (globalThis as any).generalStore.project.ydoc.getMap("calendars").toJSON()
            );
            await page.getByTestId("toolbar-undo").click();
            expect(
                await page.evaluate(() => (globalThis as any).generalStore.project.ydoc.getMap("calendars").toJSON()),
            ).toEqual({});
            expect(await readGridProjectState(page)).toEqual(before);
            const undoneHistory = await transferHistory(page);
            expect(undoneHistory.positions).toEqual([
                historyBefore.positions[0],
                1,
                historyBefore.positions[2],
                1,
                ...historyBefore.positions.slice(4),
            ]);
            await page.getByTestId("toolbar-redo").click();
            expect(await readGridProjectState(page)).toEqual(after);
            expect(
                await page.evaluate(() => (globalThis as any).generalStore.project.ydoc.getMap("calendars").toJSON()),
            ).toEqual(calendarSnapshot);
            await page.getByTestId("toolbar-undo").click();
            await page.getByTestId("toolbar-redo").click();
            expect((await transferHistory(page)).positions).toEqual(pastedHistory.positions);
            expect(await readGridProjectState(page)).toEqual(after);
            await info.attach("mixed-history-identities", {
                body: JSON.stringify({ before, after, historyBefore, pastedHistory, undoneHistory }),
                contentType: "application/json",
            });
            if (fresh) {
                const b = after.tables.find(table => table.sqlName === "b_2")!;
                expect(b.id).not.toBe(source.tables.find(table => table.sqlName === "b")!.id);
                expect(after.grids.find(grid => grid.name === "B")?.query).toBe(
                    source.grids.find(grid => grid.name === "B")!.query.replace(/\bb\b/g, "b_2"),
                );
            }
        },
    );
}
