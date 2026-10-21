/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    clickItemAndWaitForCursor,
    copyGridHosts,
    createBlankGrid,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("peer Grid deletion during acquired source synchronization refuses ordinary Paste", async ({ page }, info) => {
    test.setTimeout(180000);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const fixture = await seedCrossProjectFixture(page, info);
    await createBlankGrid(page, "Source", "source_rows");
    await addSourceRecord(page);
    const source = await readGridProjectState(page);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await copyGridHosts(page);
    const clipboard = await page.evaluate(async () =>
        Promise.all((await navigator.clipboard.read()).map(async item => ({
            types: item.types,
            data: await Promise.all(
                item.types.map(async type =>
                    Array.from(new Uint8Array(await (await item.getType(type)).arrayBuffer()))
                ),
            ),
        })))
    );
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible()) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await page.getByTestId(`object-delete-${source.grids[0].id}`).click();
    const destination = await page.context().newPage();
    let held = false;
    let resume = () => {};
    await destination.routeWebSocket(url => url.pathname.includes(`/tables/${source.tables[0].id}`), socket => {
        const server = socket.connectToServer();
        const buffered: (string | Buffer)[] = [];
        server.onMessage(message => {
            held = true;
            buffered.push(message);
        });
        let resumed = false;
        resume = () => {
            if (resumed) return;
            resumed = true;
            server.onMessage(message => socket.send(message));
            buffered.forEach(message => socket.send(message));
        };
    });
    try {
        await destination.goto(
            `${new URL(page.url()).origin}/${encodeURIComponent(fixture.destinationProject)}/${
                encodeURIComponent(fixture.destinationPage)
            }`,
        );
        await expect(destination.locator(".outliner-item[data-item-id]")).toHaveCount(2);
        await createBlankGrid(destination, "Keep", "keep");
        await clickItemAndWaitForCursor(
            destination,
            destination.locator(".outliner-item[data-item-id]").nth(1).locator(".item-content"),
        );
        const snapshot = () =>
            destination.evaluate(() => {
                const g = globalThis as any;
                return {
                    tree: g.generalStore.project.ydoc.getMap("orderedTree").toJSON(),
                    history: [
                        g.globalUndoRouter.undoDepth,
                        g.globalUndoRouter.redoDepth,
                        g.generalStore.undoManager.undoStack.length,
                        g.generalStore.undoManager.redoStack.length,
                    ],
                };
            });
        const before = await readGridProjectState(destination);
        const history = await snapshot();
        await destination.bringToFront();

        await destination.keyboard.press("Control+v");
        await expect.poll(() => held, { timeout: 15000 }).toBe(true);
        // The actual source room is acquired and receives the accepted peer delete.
        await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
        await expect.poll(() =>
            destination.evaluate(async ({ projectId, gridId }) => {
                const path = "/src/lib/yjsService.svelte.ts";
                const service = await import(/* @vite-ignore */ path);
                const doc = service.getLoadedProjectDocById(projectId);
                return doc !== undefined && !doc.getMap("yjsGrids").has(gridId);
            }, { projectId: fixture.sourceProjectId, gridId: source.grids[0].id })
        ).toBe(true);
        resume();
        await expect(destination.getByTestId("grid-paste-status")).toContainText(/source/i);
        expect(await readGridProjectState(destination)).toEqual(before);
        expect(await snapshot()).toEqual(history);
        expect(
            await destination.evaluate(async () =>
                Promise.all((await navigator.clipboard.read()).map(async item => ({
                    types: item.types,
                    data: await Promise.all(item.types.map(async type =>
                        Array.from(new Uint8Array(await (await item.getType(type)).arrayBuffer()))
                    )),
                })))
            ),
        ).toEqual(clipboard);
        expect((await readGridProjectState(page)).tables).toEqual(source.tables);
    } finally {
        resume();
        await destination.close();
    }
});
