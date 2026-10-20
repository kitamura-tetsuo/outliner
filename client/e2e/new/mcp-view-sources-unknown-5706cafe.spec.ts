import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5350c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { viewSourceBrowser } from "../utils/viewSourceBrowserHelpers";
const cases = [
    { name: "ordinary catalog", catalog: true, query: "SELECT oid AS oid FROM pg_class LIMIT 1" },
    { name: "exact constant", catalog: false, query: "SELECT 1 AS answer" },
    { name: "CR comment catalog", catalog: true, query: "SELECT oid AS oid -- comment\rFROM pg_class LIMIT 1" },
    { name: "TABLE CTE catalog", catalog: true, query: "WITH q AS (TABLE pg_class) SELECT oid AS oid FROM q LIMIT 1" },
    {
        name: "own-name catalog CTE",
        catalog: true,
        query: "WITH pg_class AS (SELECT oid AS oid FROM pg_class) SELECT oid AS oid FROM pg_class LIMIT 1",
    },
];
for (const { name, catalog, query } of cases) {
    test(
        `successful ${name} read has truthful dependencies`,
        async ({ page }, info) => {
            test.setTimeout(180000);
            const f = await viewSourceBrowser(page, info);
            try {
                const created = await f.mcp("create_grid", {
                    pageId: f.seeded.pageId,
                    query,
                    operationId: "create-unknown",
                });
                const before = await f.server.request("viewState", { token: f.token, projectId: f.projectId });
                expect(before.tables).toEqual([]);
                expect(created.query).toBe(query);
                expect(before.grids[created.gridId].query).toBe(query);
                expect(before.grids[created.gridId]).not.toHaveProperty("insertTargetTableId");
                await f.mount(created.gridId);
                const inspected = await f.mcp("get_grid", { gridId: created.gridId });
                const serverTrace = await f.mcp("trace_grid", { gridId: created.gridId });
                const context = await f.invoke("getCurrentGrid");
                const result = await f.invoke("getGridResult");
                const trace = await f.invoke("getCurrentGridTrace");
                expect(inspected.id).toBe(created.gridId);
                expect(serverTrace.gridId).toBe(created.gridId);
                expect(context.query).toBe(query);
                for (const value of [context, result, trace]) expect(value.gridId).toBe(created.gridId);
                expect(await f.mcp("get_item", { itemId: created.placementId })).toMatchObject({
                    id: created.placementId,
                    gridId: created.gridId,
                });
                for (
                    const value of [
                        created,
                        inspected,
                        serverTrace,
                        context,
                        result,
                        trace,
                    ]
                ) {
                    expect(value).not.toHaveProperty("insertTargetTableId");
                    const diagnostic = value.sourceDiagnostics;
                    expect(diagnostic.execution).toMatchObject({ status: "completed", current: true });
                    expect(diagnostic.dependencies).toMatchObject({
                        status: catalog ? "unknown" : "proven",
                        relations: [],
                    });
                    expect(diagnostic.provenance.suppliers).toEqual([]);
                    expect(diagnostic.provenance.branches).toEqual([]);
                    expect(diagnostic.provenance.bareIdSource).toBeUndefined();
                    expect(diagnostic.insert.target).toBeUndefined();
                    if (catalog) expect(diagnostic.provenance.status).toBe("unknown");
                }
                if (catalog) {
                    expect(result.rows).toHaveLength(1);
                    expect(result.rows[0]).toHaveProperty("oid");
                } else expect(result.rows).toEqual([{ answer: 1 }]);
                expect(await f.server.request("viewState", { token: f.token, projectId: f.projectId })).toEqual(before);
            } finally {
                await f.server.close();
            }
        },
    );
}
