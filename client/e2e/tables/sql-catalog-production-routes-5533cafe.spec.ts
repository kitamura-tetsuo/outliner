/** @feature SQL-5533cafe: production catalog source reaches ordinary browser routes. */
import "../utils/registerAfterEachSnapshot";
import { type BrowserContext } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import {
    freshCatalogRoute,
    readySourceReached,
    sourceReached,
    verifyFreshCatalogRoutes,
} from "../utils/catalogBrowserRoutes";
import { CatalogBrowserServer, type CatalogSnapshot } from "../utils/catalogBrowserServer";
import { authorCatalogFixture, gridValues, INITIAL_ORDER, navigateCatalog } from "../utils/catalogBrowserUi";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test(
    "catalog services, normal routes, delayed work and persisted fresh clients share one source",
    async ({ browser, page }, info) => {
        test.setTimeout(600_000);
        const server = await CatalogBrowserServer.start(info);
        const contexts: BrowserContext[] = [];
        try {
            const fixture = await authorCatalogFixture(page, server, info);
            const key = { projectId: fixture.projectId, tableId: fixture.tableId };
            const identity = { projectId: fixture.projectId, uid: fixture.uid };
            const gridUrl = `${fixture.base}/-/grids/${fixture.gridId}`;
            const initial = await server.request<CatalogSnapshot>("snapshot", key);
            expect(Object.keys(initial.table!.records)).toHaveLength(4);
            // Observe actual persistence; do not flush, serialize into, or repair the reader.
            await expect.poll(() => server.request("snapshot", { ...key, persisted: true })).toEqual(initial);

            await verifyFreshCatalogRoutes(browser, server.port, fixture, initial);

            // The same persisted Table is consumed by the normal MCP relation
            // service and Schedule worker, rather than a test compiler.
            expect(
                (await server.request<{ rows: { state: string | null; }[]; }>("mcpQuery", {
                    ...identity,
                    sql: "SELECT state FROM catalog_tasks ORDER BY state NULLS LAST",
                })).rows,
            ).toEqual(INITIAL_ORDER.map(state => ({ state })));
            // Two real embedded Grid mounts share a Table; closing one preserves the other.
            await navigateCatalog(page, fixture.projectUrl);
            await expect(page.getByTestId("yjs-table-grid")).toHaveCount(1);
            const secondGridId = await page.evaluate(
                id => (globalThis as any).__catalogBrowserTest.addSecondView(id),
                fixture.embeddedGridId,
            );
            await expect(page.getByTestId("yjs-table-grid")).toHaveCount(2);
            for (const id of [fixture.embeddedGridId, secondGridId]) {
                const view = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${id}"]`);
                await expect(view.locator('td[data-col="state"] select')).toHaveCount(4);
                await expect.poll(() => gridValues(view)).toEqual(INITIAL_ORDER);
            }
            await expect(page.locator('td[data-col="state"] select')).toHaveCount(8);
            await page.evaluate(() => (globalThis as any).__catalogBrowserTest.closeSecondView());
            await expect(page.getByTestId("yjs-table-grid")).toHaveCount(1);
            await expect(page.locator('td[data-col="state"] select')).toHaveCount(4);
            await navigateCatalog(page, `${fixture.base}/-/tables`);
            await expect(page.getByTestId("yjs-table-grid")).toHaveCount(0);
            expect(await page.evaluate(() => (globalThis as any).__catalogBrowserTest.evict())).toEqual({
                dropped: true,
            });
            await navigateCatalog(page, gridUrl);
            await expect.poll(() => gridValues(page)).toEqual(INITIAL_ORDER);
            const beforeChanges = await server.request<CatalogSnapshot>("snapshot", key);

            // A real PGlite candidate executes A; hold it before allowing the real call to finish.
            const sourceA =
                "/* older-browser-build */ CREATE TYPE priority_level AS ENUM ('high','medium','low','deferred')";
            const sourceB = "CREATE TYPE priority_level AS ENUM ('low','medium','high','deferred')";
            await page.evaluate(() => (globalThis as any).__catalogBrowserTest.pauseBuild("older-browser-build"));
            expect((await server.request("apply", { ...identity, source: sourceA })).status).toBe("applied");
            await expect.poll(() => page.evaluate(() => (globalThis as any).__catalogBrowserTest.barrier().reached))
                .toBe(true);
            expect((await server.request("apply", { ...identity, source: sourceB })).status).toBe("applied");
            await sourceReached(page, sourceB);
            await expect.poll(() => gridValues(page)).toEqual(["low", "medium", "high", null]);
            await readySourceReached(page, sourceB);
            expect(await page.evaluate(() => (globalThis as any).__catalogBrowserTest.barrier().released)).toBe(false);
            expect(await page.evaluate(() => (globalThis as any).__catalogBrowserTest.barrier().allBuildsCompleted))
                .toBe(false);
            await page.evaluate(() => (globalThis as any).__catalogBrowserTest.releaseBuild());
            await expect.poll(() => page.evaluate(() => (globalThis as any).__catalogBrowserTest.barrier()))
                .toMatchObject({ closeCompleted: true, allBuildsCompleted: true, buildFailures: [] });
            // A's candidate and complete rebuild are finished, after B was already live.
            await expect.poll(() => gridValues(page)).toEqual(["low", "medium", "high", null]);
            expect(await page.evaluate(() => (globalThis as any).__catalogBrowserTest.queryCurrentOrder()))
                .toEqual(["low", "medium", "high", null]);
            const publication = await page.evaluate(() =>
                (globalThis as any).__catalogBrowserTest.barrier().publications
            );
            expect(publication.some(state => state.status === "ready" && state.sources?.includes(sourceA))).toBe(false);
            expect(publication.some(state => state.status === "ready" && state.sources?.includes(sourceB))).toBe(true);

            // A real select change reaches the final writer before the next generation invalidates it.
            await page.evaluate(() => (globalThis as any).__catalogBrowserTest.pauseCellCommit());
            const select = page.locator('td[data-col="state"] select').first();
            await select.focus();
            await select.selectOption("high");
            const delayed = await page.evaluate(() => (globalThis as any).__catalogBrowserTest.cellCommitBarrier());
            expect(delayed).toMatchObject({ reached: true, column: "state" });
            const sourceC = "CREATE TYPE priority_level AS ENUM ('high','medium','low','deferred')";
            expect((await server.request("apply", { ...identity, source: sourceC })).status).toBe("applied");
            await sourceReached(page, sourceC);
            await expect.poll(() => gridValues(page)).toEqual(INITIAL_ORDER);
            await readySourceReached(page, sourceC);
            // C is writable again; refusal must come from B's expired origin,
            // not a transient rebuilding or missing-schema condition.
            expect(await page.evaluate(() => (globalThis as any).__catalogBrowserTest.releaseCellCommit()))
                .toMatchObject({
                    refused: true,
                    message: expect.stringContaining("Table write authority changed while the edit was open"),
                });
            await expect.poll(() => gridValues(page)).toEqual(INITIAL_ORDER);
            expect((await server.request<CatalogSnapshot>("snapshot", key)).table).toEqual(beforeChanges.table);

            // A bad synchronized record is retained, then recovered by a validated source correction.
            await server.request("remoteValue", {
                ...key,
                ...identity,
                recordId: delayed.recordId,
                column: "state",
                value: "urgent",
            });
            await expect(page.getByTestId("yjs-table-query-error")).toBeVisible();
            const inconsistent = await server.request<CatalogSnapshot>("snapshot", key);
            expect(inconsistent.table!.records[delayed.recordId].state).toBe("urgent");
            const sourceD = "CREATE TYPE priority_level AS ENUM ('high','medium','low','deferred','urgent')";
            expect((await server.request("apply", { ...identity, source: sourceD })).status).toBe("applied");
            await expect.poll(() => gridValues(page)).toEqual(["high", "medium", "urgent", null]);
            await expect(page.getByTestId("yjs-table-query-error")).toHaveCount(0);
            const corrected = await server.request<CatalogSnapshot>("snapshot", key);
            expect(corrected.table).toEqual(inconsistent.table);
            expect(corrected.project!.grids).toEqual(beforeChanges.project!.grids);
            expect(corrected.project!.calendars).toEqual(beforeChanges.project!.calendars);
            await expect.poll(() => server.request("snapshot", { ...key, persisted: true })).toEqual(corrected);
            await page.close();
            await server.request("restart", {});
            const restarted = await freshCatalogRoute(browser, server.port, gridUrl);
            contexts.push(restarted.context);
            await expect.poll(() => gridValues(restarted.page)).toEqual(["high", "medium", "urgent", null]);
            await sourceReached(restarted.page, sourceD);
            expect(
                await restarted.page.evaluate(
                    id => (globalThis as any).__catalogBrowserTest.snapshot(id),
                    fixture.tableId,
                ),
            ).toEqual(corrected.table);
            expect(await server.request("snapshot", { ...key, persisted: true })).toEqual(corrected);

            const ruleId = await restarted.page.evaluate(
                id => (globalThis as any).__catalogBrowserTest.createTypedSchedule(id),
                fixture.tableId,
            );
            await expect.poll(() => server.request("scheduleExists", { ...identity, ruleId })).toBe(true);
            expect(await server.request("runSchedule", { ...identity, ruleId })).toEqual({ success: true });
            await expect.poll(() => server.request<CatalogSnapshot>("snapshot", key)).toMatchObject({
                table: { records: { scheduled: { state: "medium" } } },
            });
        } finally {
            for (const context of contexts) await context.close();
            await server.close();
        }
    },
);
