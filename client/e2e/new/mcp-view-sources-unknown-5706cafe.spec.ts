import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5350c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { viewSourceBrowser } from "../utils/viewSourceBrowserHelpers";
for (const catalog of [true, false]) {
    test(
        `successful ${catalog ? "unresolved catalog" : "constant"} read has truthful dependencies`,
        async ({ page }, info) => {
            test.setTimeout(180000);
            const f = await viewSourceBrowser(page, info);
            try {
                const query = catalog ? "SELECT oid AS oid FROM pg_class LIMIT 1" : "SELECT 1 AS answer";
                const created = await f.mcp("create_grid", {
                    pageId: f.seeded.pageId,
                    query,
                    operationId: "create-unknown",
                });
                const before = await f.server.request("viewState", { token: f.token, projectId: f.projectId });
                expect(before.tables).toEqual([]);
                await f.mount(created.gridId);
                for (
                    const value of [
                        created,
                        await f.mcp("get_grid", { gridId: created.gridId }),
                        await f.mcp("trace_grid", { gridId: created.gridId }),
                        await f.invoke("getCurrentGrid"),
                        await f.invoke("getGridResult"),
                        await f.invoke("getCurrentGridTrace"),
                    ]
                ) {
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
                const result = await f.invoke("getGridResult");
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
