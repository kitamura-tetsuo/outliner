/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    copyGridHosts,
    createBlankGrid,
    openPasteSpecialAtAnchor,
    openProjectPage,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (const mutation of ["delete", "query", "unchanged", "unavailable"] as const) {
    test(`no-data Paste retains loaded source through SQL preparation: ${mutation}`, async ({ page }, info) => {
        test.setTimeout(180000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const fixture = await seedCrossProjectFixture(page, info);
        await createBlankGrid(page, "Source", "source_rows");
        await addSourceRecord(page);
        const source = await readGridProjectState(page);
        await page.evaluate(() => navigator.clipboard.writeText(""));
        await copyGridHosts(page);
        const peer = await page.context().newPage();
        await peer.goto(page.url());
        await expect(peer.getByTestId("yjs-table-view")).toHaveCount(1, { timeout: 60000 });
        await openProjectPage(page, fixture, "destination");
        await createBlankGrid(page, "Keep", "keep");
        await addSourceRecord(page);
        if (mutation === "unavailable") {
            // Close the real source client; retain the supported same-tab Paste
            // Special clipboard origin (native Ctrl+Shift+V supplies plain text).
            await page.evaluate(async title => {
                const path = "/src/lib/yjsService.svelte.ts";
                const { getClientByProjectTitle } = await import(/* @vite-ignore */ path);
                const client = await getClientByProjectTitle(title);
                if (!client) throw new Error("Expected the registered source client");
                client.dispose();
            }, fixture.sourceProject);
        }
        const sourceConnections: string[] = [];
        page.on("websocket", socket => {
            if (
                socket.url().includes(fixture.sourceProjectId)
                || source.tables.some(table => socket.url().includes(table.id))
            ) sourceConnections.push(socket.url());
        });
        const snapshot = () =>
            page.evaluate(async () => {
                const g = globalThis as any;
                const manager = g.generalStore.undoManager;
                return {
                    tree: g.generalStore.project.ydoc.getMap("orderedTree").toJSON(),
                    history: [
                        g.globalUndoRouter.undoDepth,
                        g.globalUndoRouter.redoDepth,
                        manager.undoStack.length,
                        manager.redoStack.length,
                    ],
                    clipboard: await Promise.all((await navigator.clipboard.read()).map(async item => ({
                        types: item.types,
                        data: await Promise.all(item.types.map(async type =>
                            Array.from(new Uint8Array(await (await item.getType(type)).arrayBuffer()))
                        )),
                    }))),
                };
            });
        // Record the loaded source identity used by structure-only admission.
        // The focused production-service regression deterministically mutates at
        // the post-analysis admission boundary; this browser case verifies the
        // same observable paste outcomes without intercepting an obsolete live DB.
        await page.evaluate(async ({ sourceId, unavailable }) => {
            const servicePath = "/src/lib/yjsService.svelte.ts";
            const { getLoadedProjectDocById } = await import(/* @vite-ignore */ servicePath);
            const g = globalThis as any;
            g.__loadedSource = getLoadedProjectDocById(sourceId);
            if (unavailable ? !!g.__loadedSource : !g.__loadedSource) {
                throw new Error("Unexpected loaded-source authority");
            }
        }, { sourceId: fixture.sourceProjectId, unavailable: mutation === "unavailable" });
        const before = await readGridProjectState(page);
        const boundary = await snapshot();
        try {
            await openPasteSpecialAtAnchor(page);
            await page.getByTestId("paste-special-copy-without-data").click();
            if (mutation === "delete") {
                const show = peer.getByRole("button", { name: "Show sidebar" });
                if (await show.isVisible()) await show.click();
                await peer.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                    .click();
                await peer.getByTestId(`object-delete-${source.grids[0].id}`).click();
                await peer.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
            } else if (mutation === "query") {
                await peer.evaluate(id => {
                    (globalThis as any).generalStore.project.ydoc.getMap("yjsGrids").get(id)
                        .set("query", "SELECT id FROM source_rows");
                }, source.grids[0].id);
            }
            await expect.poll(() =>
                page.evaluate(({ id, mutation }) => {
                    if (mutation === "unavailable") return !(globalThis as any).__loadedSource;
                    const entry = (globalThis as any).__loadedSource.getMap("yjsGrids").get(id);
                    return mutation === "delete" ? !entry : mutation === "query"
                        ? entry?.get("query") === "SELECT id FROM source_rows"
                        : !!entry;
                }, { id: source.grids[0].id, mutation })
            ).toBe(true);
            if (mutation === "unchanged" || mutation === "unavailable") {
                await expect(page.getByTestId("yjs-table-view")).toHaveCount(2);
                const result = await readGridProjectState(page);
                expect(result.tables).toHaveLength(2);
                expect(result.tables.find(table => table.id !== before.tables[0].id)?.dataSize).toBe(0);
            } else {
                await expect(page.getByTestId("grid-paste-status")).toContainText("failed", { ignoreCase: true });
                expect(await readGridProjectState(page)).toEqual(before);
                expect(await snapshot()).toEqual(boundary);
            }
            expect((await readGridProjectState(peer)).tables).toEqual(source.tables);
            expect(sourceConnections).toEqual([]);
        } finally {
            await peer.close();
        }
    });
}
