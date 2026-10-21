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

test(
    "a cold unreachable source Project retains the documented structure-only fallback",
    async ({ page, browser }, info) => {
        test.setTimeout(180000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const fixture = await seedCrossProjectFixture(page, info);
        await createBlankGrid(page, "Unreachable source", "unreachable_source");
        await addSourceRecord(page);
        const source = await readGridProjectState(page);
        await page.evaluate(() => navigator.clipboard.writeText(""));
        await copyGridHosts(page);
        const text = await page.evaluate(() => navigator.clipboard.readText());
        // Separate browser storage makes this an actual cold acquisition, not a
        // disconnected Project whose cached registry accidentally supplies evidence.
        const cold = await browser.newContext({ storageState: await page.context().storageState() });
        await cold.grantPermissions(["clipboard-read", "clipboard-write"]);
        let opened = 0;
        let closed = 0;
        await cold.routeWebSocket(url => url.pathname.endsWith(`/projects/${fixture.sourceProjectId}`), socket => {
            opened++;
            let observedClosed = false;
            socket.onClose(() => {
                if (!observedClosed) closed++;
                observedClosed = true;
            });
            // Keep only the source Project room silent; the destination and Table
            // service remain real. Initial Project sync must actually time out.
        });
        const destination = await cold.newPage();
        try {
            await destination.goto(
                `${new URL(page.url()).origin}/${encodeURIComponent(fixture.destinationProject)}/${
                    encodeURIComponent(fixture.destinationPage)
                }`,
            );
            await expect(destination.locator(".outliner-item[data-item-id]")).toHaveCount(2);
            await createBlankGrid(destination, "Keep", "keep");
            await destination.evaluate(async id => {
                const path = "/src/lib/yjs/roomSyncState.ts";
                const { onRoomSyncStateChange } = await import(/* @vite-ignore */ path);
                const states: string[] = [];
                (globalThis as any).__coldSourceSync = states;
                onRoomSyncStateChange(`projects/${id}`, (state: string) => states.push(state));
            }, fixture.sourceProjectId);
            const before = await readGridProjectState(destination);
            await clickItemAndWaitForCursor(
                destination,
                destination.locator(".outliner-item[data-item-id]").nth(1).locator(".item-content"),
            );
            expect(await destination.evaluate(() => navigator.clipboard.readText())).toBe(text);
            await destination.keyboard.press("Control+v");
            await expect.poll(() => opened).toBeGreaterThan(0);
            await expect(destination.getByTestId("grid-paste-status")).toContainText("pasted without rows", {
                timeout: 30000,
            });
            await expect(destination.getByTestId("yjs-table-view")).toHaveCount(2);
            expect(await destination.evaluate(() => (globalThis as any).__coldSourceSync)).toContain("timed-out");
            await expect.poll(() => closed).toBe(opened);
            expect(
                await destination.evaluate(async id => {
                    const path = "/src/lib/yjsService.svelte.ts";
                    const { getLoadedProjectDocById } = await import(/* @vite-ignore */ path);
                    return getLoadedProjectDocById(id) === undefined;
                }, fixture.sourceProjectId),
            ).toBe(true);
            const result = await readGridProjectState(destination);
            const copy = result.tables.find(table => !before.tables.some(existing => existing.id === table.id))!;
            expect(copy.schema).toBe(source.tables[0].schema);
            expect(copy.data).toEqual({});
            expect(result.grids.find(grid => !before.grids.some(existing => existing.id === grid.id))?.query).toBe(
                source.grids[0].query,
            );
            expect(await readGridProjectState(page)).toEqual(source);
        } finally {
            await cold.close();
        }
    },
);
