import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5350c0de: actual MCP creation reaches mounted WebMCP handlers. */
import { expect, test } from "../fixtures/grid-render-trace";
import { CatalogBrowserServer } from "../utils/catalogBrowserServer";
import { configureCatalogPage, installCatalogControls, navigateCatalog } from "../utils/catalogBrowserUi";
import { chooseInsertTarget, setInsertQuery } from "../utils/gridInsertPreferenceHelpers";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

for (const kind of ["constant", "outline", "union"] as const) {
    test(`MCP ${kind} Grid survives a production browser round trip`, async ({ page }, info) => {
        test.setTimeout(180000);
        const server = await CatalogBrowserServer.start(info);
        try {
            const title = `View sources ${kind} ${Date.now()}`;
            const projectId = SeedClient.stableIdFromTitle(title);
            const token = await TestHelpers.getTestAuthToken();
            const seeded = await server.request("seed", { token, projectId, title, pageName: "Views" });
            const mcp = (name: string, args: object) =>
                server.request("mcp", { token, name, arguments: { projectId, ...args } });
            const tables: string[] = [];
            if (kind === "union") {
                for (const sqlName of ["source_a", "source_b"]) {
                    const table = await mcp("create_table", {
                        name: sqlName,
                        schemaSql: `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`,
                        operationId: sqlName,
                    });
                    tables.push(table.tableId);
                }
                await mcp("write_relation", {
                    relation: "source_a",
                    write: { op: "INSERT", values: { id: "a1", title: "A" } },
                });
            }
            const query = kind === "constant"
                ? "SELECT 1 AS answer"
                : kind === "outline"
                ? "SELECT id AS id, text AS text FROM outline_items ORDER BY id"
                : "SELECT id AS id, title AS title FROM source_a UNION ALL SELECT id AS id, title AS title FROM source_b WHERE FALSE";
            const created = await mcp("create_grid", { pageId: seeded.pageId, query, operationId: "browser-create" });
            const before = await server.request("viewState", { token, projectId });
            expect(before.tables.map((table: { id: string; }) => table.id).sort()).toEqual([...tables].sort());
            expect(before.grids[created.gridId]).toMatchObject({ query });
            expect(before.grids[created.gridId]).not.toHaveProperty("sourceTableId");
            expect(before.grids[created.gridId]).not.toHaveProperty("insertTargetTableId");
            await configureCatalogPage(page, server.port);
            await page.addInitScript(() => {
                const registrations = new Map<string, any>();
                (globalThis as any).__viewTools = registrations;
                (globalThis as any).WebMCP = {
                    addTool: (tool: any) => {
                        registrations.set(tool.name, tool);
                        return () => {
                            if (registrations.get(tool.name) === tool) registrations.delete(tool.name);
                        };
                    },
                };
            });
            await TestHelpers.seedProjectAndNavigate(page, info, [], undefined, {
                projectName: title,
                pageName: "Views",
                skipSeed: true,
                ws: "force",
            });
            await installCatalogControls(page);
            const base = `${new URL(page.url()).origin}/${encodeURIComponent(title)}`;
            await navigateCatalog(page, `${base}/-/grids/${created.gridId}`);
            const invoke = (name: string) =>
                page.evaluate(async name => {
                    const tool = (globalThis as any).__viewTools.get(name);
                    return tool ? JSON.parse((await tool.handler()).content[0].text) : undefined;
                }, name);
            await expect.poll(async () => (await invoke("getGridResult"))?.sourceDiagnostics.execution.current).toBe(
                true,
            );
            const context = await invoke("getCurrentGrid");
            const result = await invoke("getGridResult");
            const trace = await invoke("getCurrentGridTrace");
            for (const actual of [context, result, trace]) {
                expect(actual.gridId).toBe(created.gridId);
                expect(actual).not.toHaveProperty("sourceTableId");
                expect(
                    actual.sourceDiagnostics.dependencies.relations.map((source: { id: string; }) => source.id).sort(),
                ).toEqual(
                    created.sourceDiagnostics.dependencies.relations.map((source: { id: string; }) => source.id).sort(),
                );
                expect(actual.sourceDiagnostics.insert.mode).toBe(created.sourceDiagnostics.insert.mode);
            }
            expect(context.query).toBe(query);
            if (kind === "union") expect(context.sourceDiagnostics.insert.mode).toBe("selection-required");
            await page.reload();
            await expect.poll(async () => (await invoke("getCurrentGrid"))?.gridId).toBe(created.gridId);
            await expect.poll(async () => (await invoke("getGridResult"))?.sourceDiagnostics.execution.current).toBe(
                true,
            );
            expect(await server.request("viewState", { token, projectId })).toEqual(before);
            if (kind === "union") {
                const grid = page.getByTestId("yjs-table-view");
                await chooseInsertTarget(grid, tables[1]);
                await expect.poll(async () => (await invoke("getCurrentGrid"))?.sourceDiagnostics.insert.mode).toBe(
                    "configured",
                );
                expect((await invoke("getCurrentGrid")).sourceDiagnostics.insert.target.id).toBe(tables[1]);
                expect((await mcp("get_grid", { gridId: created.gridId })).insertTargetTableId).toBe(tables[1]);
                await grid.getByTestId("yjs-table-toggle-ui").click();
                await setInsertQuery(page, grid, "SELECT id AS id, title AS title FROM source_a");
                await expect.poll(async () => (await invoke("getCurrentGrid"))?.sourceDiagnostics.insert.mode).toBe(
                    "automatic",
                );
                const dormant = await invoke("getCurrentGrid");
                expect(dormant.insertTargetTableId).toBe(tables[1]);
                expect(dormant.sourceDiagnostics.insert.preferenceDiagnostic.code).toBe("not-a-supplier");
                expect(dormant.sourceDiagnostics.insert.target.id).toBe(tables[0]);
                await setInsertQuery(page, grid, "SELECT missing_column AS value FROM source_a");
                await expect.poll(async () => (await invoke("getGridResult"))?.sourceDiagnostics.execution.status).toBe(
                    "error",
                );
                const retained = await invoke("getGridResult");
                expect(retained.rowCount).toBe(1);
                expect(retained.sourceDiagnostics.execution.current).toBe(false);
                const staleTrace = await invoke("getCurrentGridTrace");
                expect(staleTrace.stages.find((stage: { stage: string; }) => stage.stage === "render").resultStale)
                    .toBe(true);
            }
        } finally {
            await server.close();
        }
    });
}
