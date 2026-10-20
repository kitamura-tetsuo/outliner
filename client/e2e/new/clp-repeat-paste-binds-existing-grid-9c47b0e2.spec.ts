/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// Spec §9.3: a table records where it was cloned from, and a repeat paste of
// the same clipboard binds its host to that table rather than creating a
// second one. Before this, the host was pasted unbound and the page showed an
// empty create panel where the Grid should have been.
test.describe("pasting the same Grid into a project twice", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("binds the second copy to the table the first one created", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Contacts", "contacts");
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");
        await pasteAtAnchor(page, 1);

        const afterFirstPaste = await readGridProjectState(page);
        expect(afterFirstPaste.tables).toHaveLength(1);

        // Keep the Page title out of the operation so replay tests placement history.
        await pasteAtAnchor(page, 2);

        // The second host renders a Grid of its own, and no create panel is
        // offered: the binding was decided by provenance.
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 60000 });
        await expect(page.getByTestId("yjs-table-create-panel")).toHaveCount(0);

        const afterSecondPaste = await readGridProjectState(page);
        expect(afterSecondPaste.tables).toHaveLength(1);
        expect(afterSecondPaste.hostGridIds).toEqual([afterFirstPaste.grids[0].id, afterFirstPaste.grids[0].id]);
        expect(afterSecondPaste.placements.every(placement => !placement.hasPrimaryMetadata)).toBe(true);
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(async () => (await readGridProjectState(page)).hostGridIds.length).toBe(1);
        await page.getByTestId("toolbar-redo").click();
        await expect.poll(async () => (await readGridProjectState(page)).hostGridIds.length).toBe(2);
        expect(await readGridProjectState(page)).toEqual(afterSecondPaste);
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(async () => (await readGridProjectState(page)).hostGridIds.length).toBe(1);
        const peer = await page.context().newPage();
        try {
            await peer.goto(page.url());
            await expect(peer.getByTestId("yjs-table-view")).toHaveCount(1, { timeout: 60000 });
            const show = peer.getByRole("button", { name: "Show sidebar" });
            if (await show.isVisible()) await show.click();
            await peer.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                .click();
            const id = afterFirstPaste.grids[0].id;
            await peer.getByTestId(`object-delete-${id}`).click();
            await peer.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
            await expect.poll(async () => (await readGridProjectState(page)).grids.length).toBe(0);
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
            await expect.poll(() => page.evaluate(() => (globalThis as any).globalUndoRouter.lastAsyncOutcome?.status))
                .toBe("refused");
            expect(await readGridProjectState(page)).toEqual(before);
            expect(await history()).toEqual(positions);
            expect(
                await page.evaluate(() => (globalThis as any).generalStore.project.ydoc.getMap("orderedTree").toJSON()),
            ).toEqual(outline);
        } finally {
            await peer.close();
        }
    });
});
