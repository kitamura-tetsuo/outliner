import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5514c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { seedOverlappingTableFixture, snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";

test(
    "remote query revisions cancel pending editors, and fresh peer-refresh actions preserve peer fields",
    async ({ page, browser }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        const gridId = await fixture.gridA.getAttribute("data-grid-id");
        const grid = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        const cell = grid.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        const context = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as any });
        await context.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
            (globalThis as any).__E2E__ = true;
        });
        const peer = await context.newPage();
        try {
            await peer.goto(page.url());
            const peerGrid = peer.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
            await expect(peerGrid.locator('td[data-col="title"] button')).toHaveText("Value from A");
            if (!await peerGrid.getByTestId("yjs-table-query-input").isVisible()) {
                await peerGrid.getByTestId(
                    "yjs-table-toggle-ui",
                ).click();
            }
            const query = new SqlEditorHelper(peerGrid.getByTestId("yjs-table-query-input"));
            const queryA = `SELECT id AS id, title AS title, done AS done FROM ${fixture.tableA.sqlName} WHERE true`;
            const queryB = `SELECT id AS id, title AS title, done AS done FROM ${fixture.tableB.sqlName}`;
            const savedQuery = () =>
                page.evaluate(
                    id =>
                        (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc.getMap("yjsGrids").get(id).get(
                            "query",
                        ),
                    gridId,
                );
            const undoDepth = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);
            await cell.locator("button").click();
            await cell.locator("input").fill("old same-supplier intent");
            const before = await grid.getAttribute("data-mutation-incarnation");
            await query.setValue(peer, queryA);
            await expect(cell.locator("input")).toHaveValue("old same-supplier intent");
            await query.commit(peer);
            await expect.poll(savedQuery).toBe(queryA);
            await expect.poll(() => grid.getAttribute("data-mutation-incarnation")).not.toBe(before);
            await expect(grid).not.toHaveAttribute("data-mutation-incarnation", /unavailable/);
            // Invalidating the displayed execution cancels this editor. A later
            // current execution must not reopen it with fresh authority.
            await expect(cell.locator("input")).toHaveCount(0);
            await expect(cell.locator("button")).toHaveText("Value from A");
            expect(
                (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)
                    ?.data[fixture.recordId]?.title,
            ).toBe("Value from A");
            await cell.locator("button").click();
            await cell.locator("input").fill("old ABA intent");
            await query.fillAndCommit(peer, queryB);
            await expect(grid).toHaveAttribute("data-source-table-ids", JSON.stringify([fixture.tableB.id]));
            await query.fillAndCommit(peer, queryA);
            await expect.poll(savedQuery).toBe(queryA);
            await expect(grid).toHaveAttribute("data-source-table-ids", JSON.stringify([fixture.tableA.id]));
            await expect(cell.locator("input")).toHaveCount(0);
            await expect(cell.locator("button")).toHaveText("Value from A");
            expect(
                (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)
                    ?.data[fixture.recordId]?.title,
            ).toBe("Value from A");
            expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(undoDepth);
            const peerRow = peerGrid.locator(`tr[data-record-id="${fixture.recordId}"]`);
            await expect(peerRow.locator('td[data-col="done"] input')).toBeEnabled();
            await peerRow.locator('td[data-col="done"] input').focus();
            await peerRow.locator('td[data-col="done"] input').check();
            await expect.poll(async () =>
                (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)
                    ?.data[fixture.recordId]?.done
            ).toBe(true);
            await expect(grid).not.toHaveAttribute("data-mutation-incarnation", /unavailable/);
            await cell.locator("button").click();
            await cell.locator("input").fill("Fresh A edit");
            await cell.locator("input").press("Enter");
            await expect.poll(async () =>
                (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)
                    ?.data[fixture.recordId]?.title
            ).toBe("Fresh A edit");
            await page.getByTestId("toolbar-undo").click();
            await expect.poll(async () =>
                (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)
                    ?.data[fixture.recordId]
            ).toMatchObject({ title: "Value from A", done: true });
            expect(
                (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)
                    ?.data[fixture.recordId]?.title,
            ).toBe("Value from B");
        } finally {
            await context.close();
        }
    },
);
