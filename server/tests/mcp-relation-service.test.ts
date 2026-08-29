import { expect } from "chai";
import * as Y from "yjs";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { Project } from "../src/schema/app-schema.js";

describe("Outliner MCP relation service", function() {
    this.timeout(30000);

    function fixture(allowed = true) {
        const project = Project.createInstance("Relations");
        const tableId = "table-1";
        const entry = new Y.Map<unknown>();
        entry.set("name", "Tasks display");
        entry.set("sqlName", "tasks");
        project.ydoc.getMap("yjsTables").set(tableId, entry);
        const grid = new Y.Map<unknown>();
        grid.set("query", "SELECT * FROM tasks");
        project.ydoc.getMap("yjsGrids").set("grid-1", grid);
        const calendar = new Y.Map<unknown>();
        calendar.set("query", "SELECT * FROM outline_items");
        project.calendars.set("calendar-1", calendar);

        const table = new Y.Doc();
        table.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN)");
        const first = new Y.Map<string | boolean | null>();
        first.set("id", "r1");
        first.set("title", "First");
        first.set("done", false);
        table.getMap("data").set("r1", first);
        const rooms = new Map<string, Y.Doc>([
            ["projects/project-1", project.ydoc],
            ["projects/project-1/tables/table-1", table],
        ]);
        const service = new OutlinerRelationService({
            openDirectConnection: async (room: string) => ({
                document: rooms.get(room),
                disconnect: async () => {},
            }),
        } as never, async () => allowed);
        return { service, project, table };
    }

    it("lists table and system relations and introspects capabilities", async () => {
        const { service } = fixture();
        expect(await service.listRelations("uid", "project-1")).to.deep.equal({
            relations: [
                { relation: "tasks", kind: "table", tableId: "table-1", displayName: "Tasks display" },
                { relation: "outline_items", kind: "system" },
            ],
        });
        const table = await service.getRelationSchema("uid", "project-1", "tasks");
        expect(table.columns.map(column => column.name)).to.deep.equal(["id", "title", "done"]);
        expect(table.capabilities.insert).to.deep.equal({ allowed: true, requiresDestination: false });
        const system = await service.getRelationSchema("uid", "project-1", "outline_items");
        expect(system.capabilities.delete).to.deep.equal({ allowed: true, requiresDisposition: true });
    });

    it("inspects Table schema and stable-id record pages with deterministic values", async () => {
        const { service, table, project } = fixture();
        const entry = project.ydoc.getMap<Y.Map<unknown>>("yjsTables").get("table-1")!;
        entry.set("sourceProjectId", "source-project");
        entry.set("sourceTableId", "source-table");
        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(
            0,
            'CREATE TABLE tasks (id TEXT PRIMARY KEY, "order" INTEGER NOT NULL, due DATE, '
                + "at TIMESTAMPTZ, state TEXT CHECK (state IN ('open', 'done')))",
        );
        const first = table.getMap<Y.Map<string | number | boolean | null>>("data").get("r1")!;
        first.set("order", 2);
        first.set("due", "2026-08-29");
        first.set("at", "2026-08-29T10:34:56Z");
        first.set("state", "open");
        for (const id of ["r3", "r2"]) {
            const row = new Y.Map<string | number | boolean | null>();
            row.set("id", id);
            row.set("order", id === "r2" ? 3 : 4);
            table.getMap("data").set(id, row);
        }

        const metadata = await service.getTable("uid", "project-1", "table-1");
        expect(metadata).to.include({ tableId: "table-1", displayName: "Tasks display", recordCount: 3 });
        expect(metadata).not.to.have.property("records");
        expect(metadata.schema.columns.find(column => column.name === "order")).to.deep.include({
            dataType: "integer",
            kind: "integer",
            isNullable: false,
        });
        expect(metadata.schema.columns.find(column => column.name === "state")?.checkOptions)
            .to.deep.equal(["open", "done"]);
        expect(metadata.provenance).to.deep.equal({
            sourceProjectId: "source-project",
            sourceTableId: "source-table",
        });
        expect(metadata.revision).to.be.a("string").with.lengthOf(16);

        const page1 = await service.getTable("uid", "project-1", "table-1", true, 2);
        expect(page1.records.map(record => record.recordId)).to.deep.equal(["r1", "r2"]);
        expect(page1.records[0].values).to.include({
            due: "2026-08-29",
            at: "2026-08-29T10:34:56.000Z",
            done: false,
            order: 2,
        });
        expect(page1.page).to.include({ limit: 2, truncated: true });
        expect(page1.recordErrors).to.deep.equal([]);
        const page2 = await service.getTable("uid", "project-1", "table-1", true, 2, page1.page.nextCursor);
        expect(page2.records.map(record => record.recordId)).to.deep.equal(["r3"]);
        expect(page2.page).to.deep.equal({ limit: 2, truncated: false, nextCursor: undefined });
    });

    it("uses consistent mixed-case cursor ordering and validates constraints across pages", async () => {
        const { service, table } = fixture();
        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, code TEXT UNIQUE)");
        table.getMap("data").clear();
        for (const id of ["a", "B", "C"]) {
            const row = new Y.Map<string>();
            row.set("id", id);
            row.set("code", id === "a" ? "duplicate" : id === "B" ? "duplicate" : "unique");
            table.getMap("data").set(id, row);
        }
        const expected = ["a", "B", "C"].sort((a, b) => a.localeCompare(b));
        const seen: string[] = [];
        let cursor: string | undefined;
        for (let index = 0; index < expected.length; index++) {
            const result = await service.getTable("uid", "project-1", "table-1", true, 1, cursor);
            seen.push(result.records[0].recordId);
            if (result.records[0].recordId === "B") {
                expect(result.recordErrors).to.have.length(1);
            }
            cursor = result.page.nextCursor;
        }
        expect(seen).to.deep.equal(expected);
    });

    it("fails closed for Table inspection and reports malformed or unapplied schema safely", async () => {
        const denied = fixture(false);
        await expectFailure(denied.service.getTable("uid", "project-1", "table-1", true), "inaccessible");
        await expectFailure(
            Promise.resolve().then(() => denied.service.getTable("uid", "project-1", "bad/table")),
            "Invalid table ID",
        );
        expect(denied.project.ydoc.getSubdocs().size).to.equal(0);

        const { service, table, project } = fixture();
        await expectFailure(service.getTable("uid", "project-1", "missing"), "not found");
        await expectFailure(
            Promise.resolve().then(() => service.getTable("uid", "project-1", "table-1", true, 101)),
            "recordLimit",
        );
        await expectFailure(service.getTable("uid", "project-1", "table-1", true, 10, "not-a-cursor"), "cursor");
        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(0, "CREATE TABLE broken (");
        const result = await service.getTable("uid", "project-1", "table-1", true);
        expect(result.schema.status).to.equal("invalid");
        expect(result.schema.error).to.deep.include({ code: "invalid_schema" });
        expect(result.recordCount).to.equal(1);

        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(0, "CREATE TABLE tasks ()");
        const noColumns = await service.getTable("uid", "project-1", "table-1");
        expect(noColumns.schema.status).to.equal("invalid");

        table.getMap("data").clear();
        table.getText("schema").delete(0, table.getText("schema").length);
        const registryEntry = project.ydoc.getMap<Y.Map<unknown>>("yjsTables").get("table-1")!;
        registryEntry.set("sqlName", "");
        const empty = await service.getTable("uid", "project-1", "table-1", true);
        expect(empty).to.include({ sqlName: "", recordCount: 0 });
        expect(empty.schema).to.deep.include({ status: "invalid", columns: [] });
        expect(empty.records).to.deep.equal([]);

        table.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, done BOOLEAN NOT NULL)");
        const invalidRecord = new Y.Map<string | boolean | null>();
        invalidRecord.set("id", "r1");
        table.getMap("data").set("r1", invalidRecord);
        const syncResult = await service.getTable("uid", "project-1", "table-1", true);
        expect(syncResult.recordErrors).to.have.length(1);
        expect(syncResult.recordErrors?.[0]).to.include({ recordId: "r1" });
    });

    it("runs SELECT and WITH SELECT with bounded results and rejects writable SQL", async () => {
        const { service } = fixture();
        const selected = await service.querySql(
            "uid",
            "project-1",
            "WITH open AS (SELECT * FROM tasks) SELECT title FROM open",
        );
        expect(selected.rows).to.deep.equal([{ title: "First" }]);
        const bounded = await service.querySql("uid", "project-1", "SELECT * FROM generate_series(1, 3) n", 2);
        expect(bounded).to.include({ rowCount: 2, truncated: true });
        await expectFailure(service.querySql("uid", "project-1", "DELETE FROM tasks"), "Only SELECT");
        await expectFailure(service.querySql("uid", "project-1", "SELECT 1; SELECT 2"), "exactly one");
    });

    it("persists table writes in Yjs and therefore survives SQL rebuilding", async () => {
        const { service, table } = fixture();
        await service.writeRelation("uid", "project-1", "tasks", {
            op: "UPDATE",
            rowId: "r1",
            column: "done",
            value: true,
        });
        const inserted = await service.writeRelation("uid", "project-1", "tasks", {
            op: "INSERT",
            values: { id: "r2", title: "Second", done: false },
        });
        expect(inserted.rowId).to.equal("r2");
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("done")).to.equal(true);
        expect((await service.querySql("uid", "project-1", "SELECT id FROM tasks ORDER BY id")).rows)
            .to.deep.equal([{ id: "r1" }, { id: "r2" }]);
        await service.writeRelation("uid", "project-1", "tasks", { op: "DELETE", rowId: "r2" });
        expect(table.getMap("data").has("r2")).to.equal(false);
        await expectFailure(
            service.writeRelation("uid", "project-1", "tasks", {
                op: "UPDATE",
                rowId: "r1",
                column: "bogus",
                value: "poison",
            }),
            "bogus",
        );
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).has("bogus")).to.equal(false);
    });

    it("enforces system dispositions, authorization, and updates both view kinds", async () => {
        const { service, project } = fixture();
        await expectFailure(
            service.writeRelation("uid", "project-1", "outline_items", {
                op: "INSERT",
                values: { text: "No destination" },
            }),
            "destination",
        );
        await expectFailure(
            service.writeRelation("uid", "project-1", "outline_items", {
                op: "DELETE",
                rowId: "missing",
            }),
            "disposition",
        );
        await service.setViewQuery("uid", "project-1", "grid", "grid-1", "SELECT id FROM tasks");
        await service.setViewQuery("uid", "project-1", "calendar", "calendar-1", "SELECT id FROM outline_items");
        expect(project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-1")?.get("query"))
            .to.equal("SELECT id FROM tasks");
        expect(project.calendars.get("calendar-1")?.get("query")).to.equal("SELECT id FROM outline_items");
        const denied = fixture(false).service.listRelations("uid", "project-1");
        await expectFailure(denied, "inaccessible");
    });
});

async function expectFailure(promise: Promise<unknown>, message: string) {
    try {
        await promise;
        expect.fail("Expected operation to fail");
    } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include(message);
    }
}
