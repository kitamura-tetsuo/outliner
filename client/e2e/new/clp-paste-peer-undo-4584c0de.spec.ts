/** @feature CLP-4584c0de */
import type { Page } from "@playwright/test";
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

async function history(page: Page) {
    return page.evaluate(() => {
        const globals = globalThis as any;
        const manager = globals.generalStore.undoManager;
        return [
            globals.globalUndoRouter.undoDepth,
            globals.globalUndoRouter.redoDepth,
            manager.undoStack.length,
            manager.redoStack.length,
        ];
    });
}

test("ordinary cross-Project Paste refuses Undo after peer Grid Delete/Undo", async ({ page }, info) => {
    test.setTimeout(180000);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const fixture = await seedCrossProjectFixture(page, info);
    await createBlankGrid(page, "Copied Grid", "copied_grid");
    // This real selection includes an ordinary text sibling, making outline Undo applicable.
    await copyGridHosts(page);
    await openProjectPage(page, fixture, "destination");
    await createBlankGrid(page, "Warmup", "warmup");
    const warmup = (await readGridProjectState(page)).grids[0].id;
    await pasteAtAnchor(page, 2);
    const pasted = (await readGridProjectState(page)).grids.find(grid => grid.id !== warmup)!;
    await page.evaluate(id => {
        (globalThis as any).__originalPastedGrid = (globalThis as any).generalStore.project.ydoc.getMap("yjsGrids").get(
            id,
        );
    }, pasted.id);
    const peer = await page.context().newPage();
    try {
        await peer.goto(page.url());
        await expect(peer.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 60000 });
        const show = peer.getByRole("button", { name: "Show sidebar" });
        if (await show.isVisible()) await show.click();
        await peer.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
        await peer.getByTestId(`object-delete-${pasted.id}`).click();
        await peer.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
        await expect.poll(async () => (await readGridProjectState(peer)).grids.some(grid => grid.id === pasted.id))
            .toBe(false);
        await peer.goBack();
        await peer.getByTestId("toolbar-undo").click();
        await expect(peer.getByTestId("yjs-table-view")).toHaveCount(2);
        await peer.evaluate(id => {
            (globalThis as any).generalStore.project.ydoc.getMap("yjsGrids").get(id).set("name", "Peer restored Grid");
        }, pasted.id);
        // Observe the contested incarnation on the original participant before testing refusal.
        await expect.poll(() =>
            page.evaluate(id => {
                const globals = globalThis as any;
                const entry = globals.generalStore.project.ydoc.getMap("yjsGrids").get(id);
                return entry !== globals.__originalPastedGrid && entry?.get("name") === "Peer restored Grid";
            }, pasted.id)
        ).toBe(true);
        const before = await readGridProjectState(page);
        const outline = await page.evaluate(() =>
            (globalThis as any).generalStore.project.ydoc.getMap("orderedTree").toJSON()
        );
        const positions = await history(page);
        await page.getByTestId("toolbar-undo").click();
        await expect(page.getByTestId("toolbar-undo")).toBeEnabled();
        expect(await readGridProjectState(page)).toEqual(before);
        expect(await history(page)).toEqual(positions);
        expect(await page.evaluate(() => (globalThis as any).generalStore.project.ydoc.getMap("orderedTree").toJSON()))
            .toEqual(outline);
    } finally {
        await peer.close();
    }
});
