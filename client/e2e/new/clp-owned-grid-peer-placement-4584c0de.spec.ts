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
import { dispatchDragAt } from "../utils/layoutDropHelpers";
import { transferHistory } from "../utils/mixedTransferHistory";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (const layout of [false, true]) {
    test(
        `Paste Undo refuses a peer shared placement and recovers after peer Undo: layout=${layout}`,
        async ({ page }, info) => {
            test.setTimeout(180000);
            await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
            const fixture = await seedCrossProjectFixture(page, info);
            await createBlankGrid(page, "Owned", "owned");
            await addSourceRecord(page);
            const source = await readGridProjectState(page);
            await copyGridHosts(page);
            await openProjectPage(page, fixture, "destination");
            await pasteAtAnchor(page, 1);
            const original = await readGridProjectState(page);
            const peer = await page.context().newPage();
            try {
                await peer.goto(page.url());
                await expect(peer.getByTestId("yjs-table-view")).toHaveCount(1, { timeout: 60000 });
                await peer.bringToFront();
                await copyGridHosts(peer);
                let layoutId: string | undefined;
                if (layout) {
                    const block = await createBlockFromItem(
                        peer,
                        peer.locator(".outliner-item[data-item-id]").nth(1),
                        "Layout",
                    );
                    layoutId = (await block.getAttribute("data-item-id"))!;
                }
                await pasteAtAnchor(peer, 2);
                if (layout) {
                    const added = (await readGridProjectState(peer)).placements.find(p =>
                        !original.placements.some(old => old.id === p.id)
                    )!;
                    await peer.getByTestId("layout-empty").scrollIntoViewIfNeeded();
                    const box = (await peer.getByTestId("layout-empty").boundingBox())!;
                    const drop = await dispatchDragAt(
                        peer,
                        `.outliner-item[data-item-id="${added.id}"] .bullet.drag-handle`,
                        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
                    );
                    expect(drop.dropped).toBe(true);
                    await expect(peer.getByTestId("layout-cell")).toHaveCount(1);
                    await expect(page.getByTestId("layout-cell")).toHaveCount(1);
                }
                await expect(page.getByTestId("yjs-table-view")).toHaveCount(2);
                const snapshot = () =>
                    page.evaluate(() => {
                        const g = globalThis as any;
                        return {
                            tree: g.generalStore.project.ydoc.getMap("orderedTree").toJSON(),
                            positions: [
                                g.globalUndoRouter.undoDepth,
                                g.globalUndoRouter.redoDepth,
                                g.generalStore.undoManager.undoStack.length,
                                g.generalStore.undoManager.redoStack.length,
                            ],
                        };
                    });
                const before = await readGridProjectState(page);
                expect(before.grids).toHaveLength(1);
                expect(before.placements.map(p => p.gridId)).toEqual([original.grids[0].id, original.grids[0].id]);
                await page.evaluate(id => {
                    const g = globalThis as any;
                    g.__ownedGridAtConflict = g.generalStore.project.ydoc.getMap("yjsGrids").get(id);
                }, original.grids[0].id);
                const history = await snapshot();
                const identities = await transferHistory(page);
                await page.bringToFront();
                await page.getByTestId("toolbar-undo").click();
                expect(await readGridProjectState(page)).toEqual(before);
                expect(await snapshot()).toEqual(history);
                expect(
                    await page.evaluate(id => {
                        const g = globalThis as any;
                        return g.generalStore.project.ydoc.getMap("yjsGrids").get(id) === g.__ownedGridAtConflict;
                    }, original.grids[0].id),
                ).toBe(true);

                await peer.bringToFront();
                await peer.getByTestId("toolbar-undo").click();
                if (layout && (await readGridProjectState(peer)).placements.length === 2) {
                    await peer.getByTestId("toolbar-undo").click();
                }
                await expect(page.getByTestId("yjs-table-view")).toHaveCount(1);
                await page.bringToFront();
                await page.getByTestId("toolbar-undo").click();
                await expect(page.getByTestId("yjs-table-view")).toHaveCount(0);
                expect((await readGridProjectState(page)).grids).toEqual([]);
                await page.getByTestId("toolbar-redo").click();
                expect(await readGridProjectState(page)).toEqual(original);
                await page.getByTestId("toolbar-undo").click();
                expect((await readGridProjectState(page)).grids).toEqual([]);
                await openProjectPage(page, fixture, "source");
                expect(await readGridProjectState(page)).toEqual(source);
                await info.attach("peer-placement-conflict", {
                    body: JSON.stringify({ layoutId, source, original, before, history, identities }),
                    contentType: "application/json",
                });
            } finally {
                await peer.close();
            }
        },
    );
}
