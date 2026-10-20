import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect } from "chai";
import { Project } from "../src/schema/app-schema.js";
import { auditRecords, PROJECT, startMcpTestServer, token } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("source-independent Grid through the production SDK endpoint", function() {
    this.timeout(60000);
    it("creates and replays constant/system Grids with no user Tables and records exact identities", async () => {
        const f = await startMcpTestServer();
        const connector = new Client({ name: "view-sources-test", version: "1.0.0" });
        try {
            const pageId = await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                doc.getMap("yjsTables").clear();
                doc.getMap("yjsGrids").clear();
                return [...Project.fromDoc(doc).items][0].id;
            });
            const address = f.server.server.address() as { port: number; };
            await connector.connect(
                new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
                    requestInit: { headers: { Authorization: `Bearer ${token()}` } },
                }),
            );
            const tools = await connector.listTools();
            const tool = tools.tools.find(tool => tool.name === "create_grid")!;
            expect(tool.inputSchema.properties).not.to.have.property("tableId");
            expect(tool.inputSchema.properties).to.have.property("insertTargetTableId");
            const call = async (name: string, args: Record<string, unknown>) => {
                const response = await connector.callTool({ name, arguments: args });
                expect(response.isError, JSON.stringify(response)).not.to.equal(true);
                return JSON.parse((response.content as { text: string; }[])[0].text);
            };
            for (
                const [index, query] of ["SELECT 1 AS answer", "SELECT id AS id, text AS text FROM outline_items"]
                    .entries()
            ) {
                const operationId = `sdk-view-sources-${index}-${crypto.randomUUID()}`;
                const args = { projectId: PROJECT, pageId, query, operationId };
                const preview = await call("create_grid", { ...args, dryRun: true });
                expect(preview).not.to.have.property("gridId");
                const created = await call("create_grid", args);
                const replay = await call("create_grid", args);
                expect(replay).to.deep.equal({ ...created, replayed: true });
                const read = await call("get_grid", { projectId: PROJECT, gridId: created.gridId });
                expect(read).to.include({ id: created.gridId, query });
                expect(read.sourceDiagnostics.execution.current).to.equal(true);
                const trace = await call("trace_grid", { projectId: PROJECT, gridId: created.gridId });
                expect(trace.sourceDiagnostics.dependencies).to.deep.equal(read.sourceDiagnostics.dependencies);
                await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                    expect(doc.getMap("yjsTables").size).to.equal(0);
                    const entry = doc.getMap("yjsGrids").get(created.gridId) as import("yjs").Map<unknown>;
                    expect(entry.has("sourceTableId")).to.equal(false);
                    expect(entry.has("insertTargetTableId")).to.equal(false);
                    const placements = [...Project.fromDoc(doc).findPage(pageId)!.items].filter(item =>
                        item.yjsGridId === created.gridId
                    );
                    expect(placements.map(item => item.id)).to.deep.equal([created.placementId]);
                });
                const audit = (await auditRecords([operationId])).filter(record => record.tool === "create_grid");
                expect(audit.map(record => [record.applied, record.replayed])).to.deep.equal([[false, false], [
                    true,
                    false,
                ], [true, true]]);
                expect(audit[2].entity).to.equal(`grid:${created.gridId}`);
            }
        } finally {
            await connector.close();
            await f.stop();
        }
    });
});
