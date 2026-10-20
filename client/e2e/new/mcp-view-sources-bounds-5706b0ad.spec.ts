import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5350c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { navigateCatalog } from "../utils/catalogBrowserUi";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { type ViewProofGlobals, viewSourceBrowser } from "../utils/viewSourceBrowserHelpers";
test(
    "normal schema producer keeps exact internal proof and bounds mounted WebMCP diagnostics",
    async ({ page }, info) => {
        test.setTimeout(180000);
        const f = await viewSourceBrowser(page, info);
        try {
            const table = await f.mcp("create_table", {
                name: "Bounds",
                schemaSql: "CREATE TABLE bounds (id TEXT PRIMARY KEY, title TEXT)",
                operationId: "table",
            });
            const query = "SELECT id AS id, title AS title FROM bounds";
            const created = await f.mcp("create_grid", { pageId: f.seeded.pageId, query, operationId: "grid" });
            await f.mount(created.gridId);
            const base = `${new URL(page.url()).origin}/${encodeURIComponent(f.title)}`;
            const diagnostics = async () => {
                const results = await Promise.all(
                    ["getCurrentGrid", "getGridResult", "getCurrentGridTrace"].map(f.invoke),
                );
                for (const result of results) {
                    expect(JSON.stringify(result)).not.toContain("schemaRevision");
                    expect(JSON.stringify(result)).not.toContain("SCHEMA_COMMENT_SENTINEL_");
                }
                return results.map(result => result.sourceDiagnostics);
            };
            const apply = async (comment: string) => {
                await navigateCatalog(page, `${base}/-/tables/${table.tableId}`);
                await expect(page.getByTestId("table-entity-view")).toBeVisible();
                await page.getByTestId("table-entity-toggle-schema").click();
                const editor = SqlEditorHelper.byTestId(page, "yjs-table-schema-input");
                await editor.waitForReady();
                await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
                await page.evaluate(
                    sql => navigator.clipboard.writeText(sql),
                    `CREATE TABLE bounds (id TEXT PRIMARY KEY, title TEXT) /* ${comment} */`,
                );
                await editor.focus();
                await page.keyboard.press("ControlOrMeta+A");
                await page.keyboard.press("ControlOrMeta+V");
                await page.getByTestId("yjs-table-schema-apply").click();
                await expect(page.getByTestId("yjs-table-schema-apply")).toHaveText("Apply schema");
                await expect(page.getByTestId("yjs-table-schema-error")).toHaveCount(0);
                await expect.poll(() =>
                    page.evaluate(
                        id => (globalThis as unknown as ViewProofGlobals).__catalogBrowserTest.snapshot(id).schema,
                        table.tableId,
                    )
                ).toContain(comment);
                await navigateCatalog(page, `${base}/-/grids/${created.gridId}`);
                await expect.poll(async () => (await f.invoke("getGridResult"))?.sourceDiagnostics.execution.current)
                    .toBe(true);
            };
            await apply("small comment");
            const small = await diagnostics();
            const held = await page.evaluate(
                query => (globalThis as unknown as ViewProofGlobals).__catalogBrowserTest.holdViewProof(query),
                query,
            );
            expect(held.status).toBe("proven");
            expect(held.sources[0].schemaRevision).toContain("small comment");
            const sentinel = "SCHEMA_COMMENT_SENTINEL_" + "x".repeat(65536);
            await apply(sentinel);
            expect(
                await page.evaluate(() =>
                    (globalThis as unknown as ViewProofGlobals).__catalogBrowserTest.viewProofCurrent()
                ),
            ).toBe(false);
            const large = await diagnostics();
            for (let i = 0; i < large.length; i++) {
                expect(JSON.stringify(large[i])).not.toContain("schemaRevision");
                expect(JSON.stringify(large[i])).not.toContain("SCHEMA_COMMENT_SENTINEL_");
                expect(JSON.stringify(large[i]).length).toBeLessThan(4000);
                expect(Math.abs(JSON.stringify(large[i]).length - JSON.stringify(small[i]).length)).toBeLessThan(100);
                expect(large[i].execution).toMatchObject({ status: "completed", current: true });
            }
            const fresh = await page.evaluate(
                query => (globalThis as unknown as ViewProofGlobals).__catalogBrowserTest.holdViewProof(query),
                query,
            );
            expect(fresh.sources[0].schemaRevision).toContain(sentinel);
            expect(fresh.status).toBe("proven");
            await page.evaluate(() =>
                (globalThis as unknown as ViewProofGlobals).__catalogBrowserTest.releaseViewProof()
            );
            const state = await f.server.request("viewState", { token: f.token, projectId: f.projectId });
            expect(state.grids[created.gridId].query).toBe(query);
            expect(await f.mcp("get_item", { itemId: created.placementId })).toMatchObject({
                id: created.placementId,
                gridId: created.gridId,
            });
        } finally {
            await f.server.close();
        }
    },
);
