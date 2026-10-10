import { expect } from "chai";
import * as Y from "yjs";
import { restoreSqlCatalogObject } from "../../shared/src/services/sqlCatalog.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { Project } from "../src/schema/app-schema.js";

describe("MCP project catalog ENUM environment (#5534)", function() {
    this.timeout(60000);

    it("reconstructs exact ENUM metadata and semantics for independent reads and SQL", async () => {
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
        const service = new OutlinerRelationService({
            openDirectConnection: async (room: string) => ({
                document: rooms.get(room),
                disconnect: async () => {},
            }),
        } as never, async () => true);

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
});
