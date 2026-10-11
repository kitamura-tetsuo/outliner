import { expect } from "chai";
import * as Y from "yjs";
import { replaceSqlCatalogSource, restoreSqlCatalogObject } from "../../shared/src/services/sqlCatalog.js";
import { McpReadError } from "../src/mcp/mcp-error.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { Project } from "../src/schema/app-schema.js";

describe("MCP project catalog ENUM environment (#5534)", function() {
    this.timeout(60000);

    function fixture(beforeRecordBatchPublication?: () => Promise<void>) {
        const project = Project.createInstance("Typed relations");
        restoreSqlCatalogObject(project.ydoc as never, {
            id: "enum-print-state",
            kind: "enum",
            source: "CREATE TYPE print_state AS ENUM ('queued', '', 'printed')",
        });
        const entry = new Y.Map<unknown>();
        entry.set("name", "Print jobs");
        entry.set("sqlName", "print_jobs");
        project.ydoc.getMap("yjsTables").set("table-print", entry);
        const table = new Y.Doc();
        table.getText("schema").insert(
            0,
            "CREATE TABLE print_jobs (id TEXT PRIMARY KEY, state print_state, note TEXT)",
        );
        for (const [id, state] of [["one", "printed"], ["two", ""], ["three", null], ["four", "queued"]] as const) {
            const row = new Y.Map<string | null>();
            row.set("id", id);
            row.set("state", state);
            table.getMap("data").set(id, row);
        }
        const rooms = new Map<string, Y.Doc>([
            ["projects/typed", project.ydoc],
            ["projects/typed/tables/table-print", table],
        ]);
        const service = new OutlinerRelationService(
            {
                openDirectConnection: async (room: string) => ({
                    document: rooms.get(room),
                    disconnect: async () => {},
                }),
            } as never,
            async () => true,
            { beforeRecordBatchPublication },
        );
        return { project, table, service };
    }

    it("reconstructs exact ENUM metadata and semantics for independent reads and SQL", async () => {
        const { service } = fixture();
        const schema = await service.getRelationSchema("uid", "typed", "print_jobs");
        expect(schema.columns.find(column => column.name === "state")?.enum).to.deep.equal({
            objectId: "enum-print-state",
            sqlType: '"public"."print_state"',
            labels: ["queued", "", "printed"],
            source: {
                id: "enum-print-state",
                kind: "enum",
                source: "CREATE TYPE print_state AS ENUM ('queued', '', 'printed')",
            },
        });
        const result = await service.querySql(
            "uid",
            "typed",
            "SELECT state FROM print_jobs ORDER BY state NULLS LAST",
        );
        expect(result.rows).to.deep.equal([{ state: "queued" }, { state: "" }, { state: "printed" }, { state: null }]);
    });

    it("persists an empty ENUM label distinctly from NULL and refuses an invalid label", async () => {
        const { service } = fixture();
        const before = await service.getTable("uid", "typed", "table-print", true);
        await service.updateTableRecords(
            "uid",
            "typed",
            "table-print",
            [{ recordId: "three", values: { state: "" } }],
            { expectedRevision: before.revision },
        );
        const after = await service.getTable("uid", "typed", "table-print", true);
        expect(after.records.find(record => record.recordId === "three")?.values.state).to.equal("");
        try {
            await service.updateTableRecords(
                "uid",
                "typed",
                "table-print",
                [{ recordId: "three", values: { state: "not-a-label" } }],
                { expectedRevision: after.revision },
            );
            expect.fail("invalid ENUM label was accepted");
        } catch (error) {
            expect(error).to.be.instanceOf(McpReadError);
            expect((error as McpReadError).code).to.equal("validation_failed");
        }
    });

    it("refuses a record batch when the catalog changes after validation", async () => {
        let resume!: () => void;
        let paused!: () => void;
        const reached = new Promise<void>(resolve => paused = resolve);
        const barrier = new Promise<void>(resolve => resume = resolve);
        const { project, table, service } = fixture(async () => {
            paused();
            await barrier;
        });
        const before = await service.getTable("uid", "typed", "table-print");
        const updating = service.updateTableRecords(
            "uid",
            "typed",
            "table-print",
            [{ recordId: "one", values: { state: "queued" } }],
            { expectedRevision: before.revision },
        );
        await reached;
        replaceSqlCatalogSource(
            project.ydoc as never,
            "enum-print-state",
            "CREATE TYPE print_state AS ENUM ('printed', '', 'queued')",
        );
        resume();
        try {
            await updating;
            expect.fail("stale record batch was applied");
        } catch (error) {
            expect((error as McpReadError).code).to.equal("stale_revision");
        }
        expect(table.getMap<Y.Map<string>>("data").get("one")?.get("state")).to.equal("printed");
    });
});
