/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { readClipboardBytes } from "../utils/clipboardTransferEvidence";
import {
    addSourceRecord,
    copyGridHosts,
    createBlankGrid,
    openPasteSpecialAtAnchor,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("same-project shared Grid replay", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    for (const variant of ["ordinary", "another-view"] as const) {
        for (const mutation of ["delete", "replacement"] as const) {
            test(`${variant} refuses shared Grid ${mutation} on Redo`, async ({ page }, testInfo) => {
                test.setTimeout(180000);
                await seedCrossProjectFixture(page, testInfo);

                await createBlankGrid(page, "Contacts", "contacts");
                await addSourceRecord(page);
                await copyGridHosts(page);
                const clipboard = await readClipboardBytes(page);
                const source = await readGridProjectState(page);
                const id = source.grids[0].id;
                await page.evaluate(id => {
                    (globalThis as any).__originalSharedGrid = (globalThis as any).generalStore.project.ydoc.getMap(
                        "yjsGrids",
                    ).get(id);
                }, id);
                await createBlankGrid(page, "Keep", "keep");

                const afterFirstPaste = await readGridProjectState(page);
                const peer = await page.context().newPage();
                await peer.goto(page.url());
                await expect(peer.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 60000 });
                // Keep the Page title out of the operation so replay tests placement history.
                if (variant === "ordinary") await pasteAtAnchor(page, 3);
                else {
                    await openPasteSpecialAtAnchor(page);
                    await page.getByTestId("paste-special-another-view").click();
                }

                // The second host renders a Grid of its own, and no create panel is
                // offered: the binding was decided by provenance.
                await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });
                await expect(page.getByTestId("yjs-table-create-panel")).toHaveCount(0);

                const afterSecondPaste = await readGridProjectState(page);
                expect(afterSecondPaste.tables).toHaveLength(2);
                expect(afterSecondPaste.hostGridIds.filter(value => value === id)).toHaveLength(2);
                expect(afterSecondPaste.placements.every(placement => !placement.hasPrimaryMetadata)).toBe(true);
                await page.getByTestId("toolbar-undo").click();
                await expect.poll(async () => (await readGridProjectState(page)).hostGridIds.length).toBe(2);
                await page.getByTestId("toolbar-redo").click();
                await expect.poll(async () => (await readGridProjectState(page)).hostGridIds.length).toBe(3);
                expect(await readGridProjectState(page)).toEqual(afterSecondPaste);
                await page.getByTestId("toolbar-undo").click();
                await expect.poll(async () => (await readGridProjectState(page)).hostGridIds.length).toBe(2);
                try {
                    const show = peer.getByRole("button", { name: "Show sidebar" });
                    if (await show.isVisible()) await show.click();
                    await peer.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                        .click();
                    await peer.getByTestId(`object-delete-${id}`).click();
                    await peer.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
                    await expect.poll(async () => (await readGridProjectState(page)).grids.some(grid => grid.id === id))
                        .toBe(false);
                    if (mutation === "replacement") {
                        await peer.goBack();
                        await peer.getByTestId("toolbar-undo").click();
                        await expect.poll(async () =>
                            (await readGridProjectState(peer)).grids.some(grid => grid.id === id)
                        ).toBe(true);
                        await peer.evaluate(
                            id =>
                                (globalThis as any).generalStore.project.ydoc.getMap("yjsGrids").get(id).set(
                                    "name",
                                    "Peer replacement",
                                ),
                            id,
                        );
                        await expect.poll(() =>
                            page.evaluate(id => {
                                const g = globalThis as any;
                                const entry = g.generalStore.project.ydoc.getMap("yjsGrids").get(id);
                                return entry !== g.__originalSharedGrid && entry?.get("name") === "Peer replacement";
                            }, id)
                        ).toBe(true);
                    }
                    const history = () =>
                        page.evaluate(() => {
                            const globals = globalThis as any;
                            const manager = globals.generalStore.undoManager;
                            return [
                                globals.globalUndoRouter.undoDepth,
                                globals.globalUndoRouter.redoDepth,
                                manager.undoStack.length,
                                manager.redoStack.length,
                            ];
                        });
                    const before = await readGridProjectState(page);
                    const positions = await history();
                    const outline = await page.evaluate(() =>
                        (globalThis as any).generalStore.project.ydoc.getMap("orderedTree").toJSON()
                    );
                    await page.getByTestId("toolbar-redo").click();
                    await expect.poll(() =>
                        page.evaluate(() => (globalThis as any).globalUndoRouter.lastAsyncOutcome?.status)
                    )
                        .toBe("refused");
                    expect(await readGridProjectState(page)).toEqual(before);
                    expect(await history()).toEqual(positions);
                    expect(await readClipboardBytes(page)).toEqual(clipboard);
                    expect((await readGridProjectState(page)).tables).toEqual(afterFirstPaste.tables);
                    expect(
                        await page.evaluate(() =>
                            (globalThis as any).generalStore.project.ydoc.getMap("orderedTree").toJSON()
                        ),
                    ).toEqual(outline);
                } finally {
                    await peer.close();
                }
            });
        }
    }
});
