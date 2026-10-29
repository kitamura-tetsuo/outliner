import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { createKanbanEntry, getKanbanRegistry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { restartFromStorage, stopTestServer, withRoom } from "./server-create-table-fixture.js";

describe("Kanban lifecycle durable preservation through MCP", function() {
    this.timeout(120_000);
    it("preserves source schema and records and unrelated content across a storage reload", async () => {
        const f = await startMcpTestServer();
        let restarted: Awaited<ReturnType<typeof restartFromStorage>> | undefined;
        try {
            const room = `projects/${PROJECT}`;
            const source = `${room}/tables/table-existing`;
            await withRoom(f.server.hocuspocus, source, doc => {
                const record = new Y.Map<unknown>();
                record.set("id", "record-1");
                record.set("title", "Keep this record");
                doc.getMap("data").set("record-1", record);
            });
            const beforeSource = await withRoom(f.server.hocuspocus, source, sourceSnapshot);
            const before = await withRoom(f.server.hocuspocus, room, doc => {
                createKanbanEntry(doc, "board", {
                    name: "Board",
                    query: "SELECT 1",
                    groupField: "g",
                    titleField: "t",
                    detailFields: [],
                });
                const page = Project.fromDoc(doc).items.at(0)!;
                const placement = page.items.addNode("owner");
                placement.componentType = "kanban";
                placement.kanbanId = "board";
                return {
                    pageId: page.id,
                    itemId: page.items.at(0)!.id,
                    itemText: page.items.at(0)!.text,
                    grids: doc.getMap("yjsGrids").toJSON(),
                    tables: tableSnapshot(doc),
                };
            });
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const result = await f.mcp.call("delete_kanban", {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
                operationId: "preserve-source",
            });
            expect(result.payload).to.include({ applied: true, removedPlacementCount: 1 });
            restarted = await restartFromStorage(f.dir, f.acl);
            expect(await withRoom(restarted.server.hocuspocus, source, sourceSnapshot)).to.deep.equal(beforeSource);
            await withRoom(restarted.server.hocuspocus, room, doc => {
                expect(getKanbanRegistry(doc).has("board")).to.equal(false);
                const page = Project.fromDoc(doc).findPage(before.pageId)!;
                expect(page.items.length).to.equal(1);
                expect(page.items.at(0)!.id).to.equal(before.itemId);
                expect(page.items.at(0)!.text).to.equal(before.itemText);
                expect(doc.getMap("yjsGrids").toJSON()).to.deep.equal(before.grids);
                expect(tableSnapshot(doc)).to.deep.equal(before.tables);
            });
        } finally {
            if (restarted) {
                await stopTestServer(restarted.server);
                await fs.remove(restarted.dir);
            }
            await f.stop();
        }
    });
});
function sourceSnapshot(doc: Y.Doc) {
    return { schema: doc.getText("schema").toString(), records: doc.getMap("data").toJSON() };
}

function tableSnapshot(doc: Y.Doc) {
    return [...doc.getMap<Y.Map<unknown>>("yjsTables").entries()].map(([id, table]) => ({
        id,
        name: table.get("name"),
        sqlName: table.get("sqlName"),
        guid: (table.get("doc") as Y.Doc).guid,
    }));
}
