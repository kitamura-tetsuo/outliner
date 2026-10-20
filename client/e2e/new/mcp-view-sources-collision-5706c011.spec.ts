import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5350c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { navigateCatalog } from "../utils/catalogBrowserUi";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { type ViewProofGlobals, viewSourceBrowser } from "../utils/viewSourceBrowserHelpers";

test(
    "native catalog binding excludes a normally applied same-named Table on MCP and WebMCP",
    async ({ page }, info) => {
        test.setTimeout(180000);
        const f = await viewSourceBrowser(page, info);
        try {
            const table = await f.mcp("create_table", {
                name: "Collision",
                schemaSql: "CREATE TABLE collision_source (id TEXT PRIMARY KEY, oid BIGINT)",
                operationId: "table",
            });
            const ordinary = await f.mcp("create_grid", {
                pageId: f.seeded.pageId,
                query: "SELECT oid AS oid FROM collision_source",
                operationId: "ordinary-grid",
            });
            await f.mount(ordinary.gridId);
            await expect.poll(async () => (await f.invoke("getCurrentGrid"))?.sourceDiagnostics.insert.mode)
                .toBe("automatic");
            for (const value of [ordinary, await f.invoke("getCurrentGrid"), await f.invoke("getGridResult")]) {
                expect(value.sourceDiagnostics.dependencies).toMatchObject({
                    status: "proven",
                    relations: [{ kind: "table", id: table.tableId, sqlName: "collision_source" }],
                });
                expect(value.sourceDiagnostics.insert).toMatchObject({
                    mode: "automatic",
                    target: { id: table.tableId },
                });
            }
            const base = `${new URL(page.url()).origin}/${encodeURIComponent(f.title)}`;
            await navigateCatalog(page, `${base}/-/tables/${table.tableId}`);
            await expect(page.getByTestId("table-entity-view")).toBeVisible();
            await page.getByTestId("table-entity-toggle-schema").click();
            const editor = SqlEditorHelper.byTestId(page, "yjs-table-schema-input");
            await editor.waitForReady();
            const sql = "CREATE TABLE pg_class (id TEXT PRIMARY KEY, oid BIGINT)";
            await editor.setValue(page, sql);
            await page.getByTestId("yjs-table-schema-apply").click();
            await expect(page.getByTestId("yjs-table-schema-apply")).toHaveText("Apply schema");
            await expect(page.getByTestId("yjs-table-schema-error")).toHaveCount(0);
            await expect.poll(() =>
                page.evaluate(id => {
                    const controls = (globalThis as unknown as ViewProofGlobals).__catalogBrowserTest;
                    return {
                        snapshot: controls.snapshot(id),
                        sqlName: controls.tables().find(table => table.tableId === id)?.sqlName,
                    };
                }, table.tableId)
            ).toEqual({ snapshot: { schema: sql, records: {} }, sqlName: "pg_class" });
            await expect.poll(() => f.server.request("viewState", { token: f.token, projectId: f.projectId }))
                .toMatchObject({ tables: [{ id: table.tableId, sqlName: "pg_class" }] });
            const query = "SELECT oid AS oid FROM pg_class LIMIT 1";
            const created = await f.mcp("create_grid", {
                pageId: f.seeded.pageId,
                query,
                operationId: "collision-grid",
            });
            await navigateCatalog(page, `${base}/-/grids/${created.gridId}`);
            await expect.poll(async () => (await f.invoke("getCurrentGrid"))?.gridId).toBe(created.gridId);
            await expect.poll(async () => (await f.invoke("getGridResult"))?.sourceDiagnostics.execution.current).toBe(
                true,
            );
            const before = await f.server.request("viewState", { token: f.token, projectId: f.projectId });
            const context = await f.invoke("getCurrentGrid");
            const result = await f.invoke("getGridResult");
            const trace = await f.invoke("getCurrentGridTrace");
            const inspected = await f.mcp("get_grid", { gridId: created.gridId });
            const nativeTrace = await f.mcp("trace_grid", { gridId: created.gridId });
            expect(inspected.id).toBe(created.gridId);
            expect(nativeTrace.gridId).toBe(created.gridId);
            expect(inspected.validation.sampleRows).toHaveLength(1);
            expect(inspected.validation.sampleRows[0]).toHaveProperty("oid");
            for (const value of [context, result, trace]) expect(value.gridId).toBe(created.gridId);
            for (
                const value of [
                    created,
                    inspected,
                    nativeTrace,
                    context,
                    result,
                    trace,
                ]
            ) {
                expect(value).not.toHaveProperty("insertTargetTableId");
                const diagnostic = value.sourceDiagnostics;
                expect(diagnostic.execution).toMatchObject({ status: "completed", current: true });
                expect(diagnostic.dependencies).toMatchObject({ status: "unknown", relations: [] });
                expect(diagnostic.provenance.status).toBe("unknown");
                expect(diagnostic.provenance.suppliers).toEqual([]);
                expect(diagnostic.provenance.branches).toEqual([]);
                expect(diagnostic.provenance.bareIdSource).toBeUndefined();
                expect(diagnostic.insert.mode).toBe("unavailable");
                expect(diagnostic.insert.target).toBeUndefined();
                expect(JSON.stringify(diagnostic)).not.toContain(table.tableId);
                expect(JSON.stringify(diagnostic)).not.toContain("relationOid");
            }
            expect(context.query).toBe(query);
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toHaveProperty("oid");
            expect(
                await page.evaluate(
                    id => (globalThis as unknown as ViewProofGlobals).__catalogBrowserTest.snapshot(id).records,
                    table.tableId,
                ),
            )
                .toEqual({});
            expect((await f.server.request("snapshot", { projectId: f.projectId, tableId: table.tableId })).table)
                .toEqual({ schema: sql, records: {} });
            expect(await f.mcp("get_item", { itemId: created.placementId })).toMatchObject({
                id: created.placementId,
                gridId: created.gridId,
            });
            expect(before.grids[created.gridId]).toMatchObject({ query });
            expect(before.grids[created.gridId]).not.toHaveProperty("insertTargetTableId");
            expect(await f.server.request("viewState", { token: f.token, projectId: f.projectId })).toEqual(before);
        } finally {
            await f.server.close();
        }
    },
);
