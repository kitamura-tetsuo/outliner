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
    const evidence = {
        stage: "fixture",
        sourceProjectId: "unavailable",
        destinationProjectId: "unavailable",
        sourceGridId: "unavailable",
        sourceTableId: "unavailable",
        clipboardTypes: [] as readonly (readonly string[])[],
        interceptedRooms: [] as string[],
        clientMessages: 0,
        serverMessages: 0,
        deletionObserved: false,
        focus: "unavailable" as string,
        selection: "unavailable" as string,
    };
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const fixture = await seedCrossProjectFixture(page, info);
    evidence.sourceProjectId = fixture.sourceProjectId;
    evidence.destinationProjectId = fixture.destinationProjectId;
    await createBlankGrid(page, "Source", "source_rows");
    await addSourceRecord(page);
    const source = await readGridProjectState(page);
    evidence.sourceGridId = source.grids[0].id;
    evidence.sourceTableId = source.tables[0].id;
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible()) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await page.getByTestId(`object-delete-${source.grids[0].id}`).click();
    const destination = await page.context().newPage();
    let held = false;
    let resume = () => {};
    const sourceTableRoom = `/projects/${fixture.sourceProjectId}/tables/${source.tables[0].id}`;
    await destination.routeWebSocket(url => url.pathname === sourceTableRoom, socket => {
        evidence.interceptedRooms.push(sourceTableRoom);
        const server = socket.connectToServer();
        const buffered: (string | Buffer)[] = [];
        socket.onMessage(message => {
            evidence.clientMessages++;
            server.send(message);
        });
        server.onMessage(message => {
            evidence.serverMessages++;
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
        // Copy only after both pages and the destination editor exist. This makes
        // the trusted source Copy the final clipboard-writing interaction instead
        // of relying on clipboard ownership across page creation and navigation.
        evidence.stage = "copy";
        await page.bringToFront();
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
        evidence.clipboardTypes = clipboard.map(item => item.types);
        expect(evidence.clipboardTypes.some(types => types.includes("text/html"))).toBe(true);

        evidence.stage = "destination-ready";
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
        const readiness = await destination.evaluate(() => ({
            focus: document.activeElement instanceof Element
                ? `${document.activeElement.tagName.toLowerCase()}.${document.activeElement.className}`
                : "unavailable",
            selection: JSON.stringify((globalThis as any).editorOverlayStore?.selection ?? "unavailable"),
        }));
        evidence.focus = readiness.focus;
        evidence.selection = readiness.selection;

        evidence.stage = "paste-started";
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
        evidence.deletionObserved = true;
        resume();
        evidence.stage = "refusal";
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
        evidence.stage = "complete";
    } catch (error) {
        await info.attach("live-source-paste-evidence.json", {
            body: Buffer.from(JSON.stringify(evidence, undefined, 2)),
            contentType: "application/json",
        });
        throw error;
    } finally {
        resume();
        await destination.close();
    }
});
