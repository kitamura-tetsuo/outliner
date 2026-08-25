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
