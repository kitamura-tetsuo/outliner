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
        grid.set("sourceTableId", tableId);
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

    it("dry-runs Table schema migrations with diffs, warnings, and no project mutation", async () => {
        const { service, project, table } = fixture();
        const projectBefore = Buffer.from(Y.encodeStateAsUpdate(project.ydoc)).toString("base64");
        const tableBefore = Buffer.from(Y.encodeStateAsUpdate(table)).toString("base64");
        const valid = await service.validateTableSchema(
            "uid",
            "project-1",
            "table-1",
            'CREATE TABLE tasks (id TEXT PRIMARY KEY, title INTEGER, "order" INTEGER)',
        );
        expect(valid.parsedSchema).to.deep.include({ status: "valid", tableName: "tasks" });
        expect(valid.migrationDiff.addedColumns).to.deep.equal(["order"]);
        expect(valid.migrationDiff.removedColumns).to.deep.equal(["done"]);
        expect(valid.migrationDiff.changedColumns.find(change => change.name === "title")).to.deep.include({
            name: "title",
            fromType: "text",
            toType: "integer",
        });
        expect(valid.accepted).to.equal(false);
        expect(valid.affectedRecords).to.deep.include({ total: 1, incompatible: 1 });
        expect(valid.warnings.join(" ")).to.include("would be removed");

        const invalid = await service.validateTableSchema(
            "uid",
            "project-1",
            "table-1",
            "DROP TABLE tasks",
        );
        expect(invalid.accepted).to.equal(false);
        expect(invalid.errors[0]).to.deep.include({ phase: "schema-parse", code: "invalid_schema" });
        expect(Buffer.from(Y.encodeStateAsUpdate(project.ydoc)).toString("base64")).to.equal(projectBefore);
        expect(Buffer.from(Y.encodeStateAsUpdate(table)).toString("base64")).to.equal(tableBefore);
        expect(table.getText("schema").toString()).to.include("done BOOLEAN");
        const duplicate = new Y.Map<unknown>();
        duplicate.set("sqlName", "duplicate_name");
        project.ydoc.getMap("yjsTables").set("table-2", duplicate);
        for (const unavailable of ["outline_items", "duplicate_name"]) {
            const result = await service.validateTableSchema(
                "uid",
                "project-1",
                "table-1",
                `CREATE TABLE ${unavailable} (id TEXT PRIMARY KEY)`,
            );
            expect(result.accepted).to.equal(false);
            expect(result.errors[0]).to.deep.include({
                phase: "schema-validation",
                code: "relation_name_unavailable",
            });
        }
        project.ydoc.getMap("yjsTables").delete("table-2");
    });

    it("validates Grid SELECTs, preserves quoted identifiers, and never saves the proposal", async () => {
        const { service, project, table } = fixture();
        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(0, 'CREATE TABLE tasks (id TEXT PRIMARY KEY, "order" INTEGER, title TEXT)');
        const first = table.getMap<Y.Map<unknown>>("data").get("r1")!;
        first.delete("done");
        first.set("order", 2);
        const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-1")!;
        const savedQuery = String(grid.get("query"));
        const before = Buffer.from(Y.encodeStateAsUpdate(project.ydoc)).toString("base64");

        const quoted = await service.validateGridQuery(
            "uid",
            "project-1",
            "grid-1",
            'SELECT id, "order" FROM "tasks" ORDER BY "order"',
            1,
        );
        expect(quoted).to.deep.include({
            accepted: true,
            normalizedQuery: 'SELECT id, "order" FROM "tasks" ORDER BY "order"',
            dependencies: ["tasks"],
            inferredOrdering: "sql-order-by",
        });
        expect(quoted.resultColumns.map(column => column.name)).to.deep.equal(["id", "order"]);
        expect(quoted.sampleRows).to.deep.equal([{ id: "r1", order: 2 }]);
        expect(quoted.editability).to.deep.include({ editable: true, rowIdentity: "id" });

        const malformed = new Y.Map<unknown>();
        malformed.set("id", "r2");
        malformed.set("order", "not-an-integer");
        malformed.set("title", "Skipped");
        table.getMap("data").set("r2", malformed);
        const tolerant = await service.validateGridQuery(
            "uid",
            "project-1",
            "grid-1",
            'SELECT id FROM tasks ORDER BY "order"',
        );
        expect(tolerant.accepted).to.equal(true);
        expect(tolerant.sampleRows).to.deep.equal([{ id: "r1" }]);
        expect(tolerant.warnings).to.have.length(1);
        table.getMap("data").delete("r2");

        const shadowed = await service.validateGridQuery(
            "uid",
            "project-1",
            "grid-1",
            "WITH tasks AS (SELECT 'synthetic'::text AS id) SELECT id FROM tasks",
        );
        expect(shadowed.dependencies).to.deep.equal([]);
        expect(shadowed.editability).to.deep.include({ editable: false });

        const reserved = await service.validateGridQuery(
            "uid",
            "project-1",
            "grid-1",
            "SELECT id, order FROM tasks ORDER BY order",
        );
        expect(reserved.accepted).to.equal(false);
        expect(reserved.errors[0]).to.include({ phase: "validation" });
        for (
            const rejected of [
                "SELECT 1; SELECT 2",
                "UPDATE tasks SET title = 'changed'",
                "CREATE TABLE poison (id TEXT)",
            ]
        ) {
            const result = await service.validateGridQuery("uid", "project-1", "grid-1", rejected);
            expect(result.accepted, rejected).to.equal(false);
            expect(result.errors[0]).to.include({ phase: "validation" });
        }
        expect(grid.get("query")).to.equal(savedQuery);
        expect(Buffer.from(Y.encodeStateAsUpdate(project.ydoc)).toString("base64")).to.equal(before);
        expect(first.get("title")).to.equal("First");
    });

    it("traces bounded Grid results, identities, ordering, and presentation transforms", async () => {
        const { service, project, table } = fixture();
        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(0, 'CREATE TABLE tasks (id TEXT PRIMARY KEY, "order" INTEGER, title TEXT)');
        const first = table.getMap<Y.Map<unknown>>("data").get("r1")!;
        first.delete("done");
        first.set("order", null);
        for (const [id, order] of [["r2", 2], ["r3", 1]] as const) {
            const row = new Y.Map<unknown>();
            row.set("id", id);
            row.set("order", order);
            row.set("title", id);
            table.getMap("data").set(id, row);
        }
        const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-1")!;
        grid.set("query", 'SELECT id, "order", title, "order" * 2 AS computed FROM tasks ORDER BY "order" NULLS LAST');
        grid.set("columnOrder", ["title", "order", "id", "computed"]);
        const components = new Y.Map<Y.Map<unknown>>();
        const hidden = new Y.Map<unknown>();
        hidden.set("hidden", true);
        components.set("id", hidden);
        grid.set("components", components);

        const trace = await service.traceGrid("uid", "project-1", "grid-1", 2);
        const source = trace.stages.find(stage => stage.stage === "source")!;
        const execution = trace.stages.find(stage => stage.stage === "query-execution")!;
        const render = trace.stages.find(stage => stage.stage === "render")!;
        expect(source).to.include({ status: "current", observed: true });
        expect(source.schemaColumns).to.include("order");
        expect(execution).to.include({ status: "completed", orderSource: "sql-order-by", truncated: true });
        expect(execution.rows.map(row => row.identity.value)).to.deep.equal(["r3", "r2"]);
        expect(execution.editability).to.deep.include({ editable: true, rowIdentity: "id" });
        expect(execution.editability.editableColumns).not.to.include("computed");
        expect(render).to.include({ observed: false, rowCount: 2, columnCount: 3 });
        expect(render.columns).to.deep.equal(["title", "order", "computed"]);
    });

    it("distinguishes incidental ordering, read-only results, failures, stale sources, and authorization", async () => {
        const { service, project } = fixture();
        const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-1")!;
        grid.set("query", "SELECT title || '!' AS computed FROM tasks");
        const unordered = await service.traceGrid("uid", "project-1", "grid-1");
        const execution = unordered.stages.find(stage => stage.stage === "query-execution")!;
        expect(execution).to.include({ orderSource: "incidental-source-order", status: "completed" });
        expect(execution.editability).to.deep.include({ editable: false });
        expect(execution.rows[0].identity).to.deep.equal({ kind: "result-ordinal", value: 0, stable: false });

        grid.set("query", "SELECT missing FROM tasks");
        const failed = await service.traceGrid("uid", "project-1", "grid-1");
        const errorStage = failed.stages.find(stage => stage.stage === "query-execution")!;
        expect(errorStage).to.include({ status: "error", observed: true });
        expect(errorStage.error).to.include({ phase: "execution" });

        grid.set("sourceTableId", "deleted-table");
        const stale = await service.traceGrid("uid", "project-1", "grid-1");
        expect(stale.stages[1]).to.deep.include({ stage: "source", status: "stale" });
        await expectFailure(fixture(false).service.traceGrid("uid", "project-1", "grid-1"), "inaccessible");
    });

    it("normalizes values and matches canonical source identity and SQL-noise analysis", async () => {
        const { service, project } = fixture();
        const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-1")!;
        grid.set(
            "query",
            "SELECT id, 'tasks' AS source_kind, id AS source_id, "
                + "9007199254740993::bigint AS huge, repeat('x', 300) AS note, 'join order by where' AS label "
                + "FROM tasks -- join order by where",
        );
        const trace = await service.traceGrid("uid", "project-1", "grid-1");
        const execution = trace.stages.find(stage => stage.stage === "query-execution")!;
        const render = trace.stages.find(stage => stage.stage === "render")!;
        expect(execution).to.include({ status: "completed", orderSource: "incidental-source-order" });
        expect(execution.editability).to.deep.include({ editable: true, rowIdentity: "source" });
        expect(execution.rows[0].identity).to.deep.equal({ kind: "source", relation: "tasks", value: "r1" });
        expect(execution.rows[0].values.huge).to.equal("9007199254740993");
        expect(execution.rows[0].values.note).to.have.length(201);
        expect(render.transforms).to.include({ filtering: "none", sorting: "incidental-source-order" });
        expect(() => JSON.stringify(trace)).not.to.throw();
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

    it("migrates a Table schema additively via update_table_schema with dry-run, retries, and revision checks", async () => {
        const { service, table } = fixture();
        const before = await service.getTable("uid", "project-1", "table-1");
        const schemaSql = 'CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN, "order" INTEGER)';

        const dryRun = await service.updateTableSchema("uid", "project-1", "table-1", schemaSql, {
            expectedRevision: before.revision,
            dryRun: true,
        });
        expect(dryRun).to.include({ applied: false, destructive: false });
        expect(dryRun.revision).to.equal(before.revision);
        expect(table.getText("schema").toString()).to.not.include("order");

        await expectFailureCode(
            service.updateTableSchema("uid", "project-1", "table-1", schemaSql, {
                expectedRevision: "stale-revision-token",
            }),
            "stale_revision",
        );

        const applied = await service.updateTableSchema("uid", "project-1", "table-1", schemaSql, {
            expectedRevision: before.revision,
            operationId: "schema-op-1",
        });
        expect(applied.applied).to.equal(true);
        expect(applied.destructive).to.equal(false);
        expect(applied.revision).to.not.equal(before.revision);
        expect(table.getText("schema").toString()).to.include('"order" INTEGER');

        const replayed = await service.updateTableSchema("uid", "project-1", "table-1", schemaSql, {
            expectedRevision: before.revision,
            operationId: "schema-op-1",
        });
        expect(replayed.replayed).to.equal(true);
        expect(replayed.revision).to.equal(applied.revision);
    });

    it("requires acknowledgeDestructive to apply a destructive schema migration; dry-run never needs it", async () => {
        const { service, table } = fixture();
        const before = await service.getTable("uid", "project-1", "table-1");
        const destructiveSql = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)";

        const dryRun = await service.updateTableSchema("uid", "project-1", "table-1", destructiveSql, {
            expectedRevision: before.revision,
            dryRun: true,
        });
        expect(dryRun).to.include({ applied: false, destructive: true });
        expect(dryRun.validation.migrationDiff.removedColumns).to.deep.equal(["done"]);

        await expectFailureCode(
            service.updateTableSchema("uid", "project-1", "table-1", destructiveSql, {
                expectedRevision: before.revision,
            }),
            "destructive_confirmation_required",
        );
        expect(table.getText("schema").toString()).to.include("done BOOLEAN");

        const applied = await service.updateTableSchema("uid", "project-1", "table-1", destructiveSql, {
            expectedRevision: before.revision,
            acknowledgeDestructive: true,
        });
        expect(applied).to.include({ applied: true, destructive: true });
        expect(table.getText("schema").toString()).to.equal(destructiveSql);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).has("done")).to.equal(false);
    });

    it("rechecks SQL-name availability against live state immediately before committing a schema migration", async () => {
        const { service, project } = fixture();
        const before = await service.getTable("uid", "project-1", "table-1");
        const other = new Y.Map<unknown>();
        other.set("name", "Other");
        other.set("sqlName", "other_table");
        project.ydoc.getMap("yjsTables").set("table-2", other);

        // Simulates another Table being renamed to the same SQL name in the
        // window between the initial validateTableSchema check (a separate
        // connection, made before this call is reached) and the commit step:
        // wrap validateTableSchema so the real check runs and passes first
        // (the name is still free), then land the conflicting rename right
        // after it returns, exactly where a concurrent request would.
        const originalValidate = service.validateTableSchema.bind(service);
        (service as unknown as { validateTableSchema: OutlinerRelationService["validateTableSchema"]; })
            .validateTableSchema = (async (
                ...args: Parameters<OutlinerRelationService["validateTableSchema"]>
            ) => {
                const result = await originalValidate(...args);
                other.set("sqlName", "tasks_renamed");
                return result;
            }) as OutlinerRelationService["validateTableSchema"];

        await expectFailure(
            service.updateTableSchema(
                "uid",
                "project-1",
                "table-1",
                "CREATE TABLE tasks_renamed (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN)",
                { expectedRevision: before.revision },
            ),
            "already used by another Table",
        );
    });

    it("integrates an applied schema migration with a live client's own Y.UndoManager", async () => {
        const { service, table } = fixture();
        const before = await service.getTable("uid", "project-1", "table-1");
        const undoManager = new Y.UndoManager([table.getText("schema"), table.getMap("data")], {
            trackedOrigins: new Set([null]),
        });
        const destructiveSql = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)";

        await service.updateTableSchema("uid", "project-1", "table-1", destructiveSql, {
            expectedRevision: before.revision,
            acknowledgeDestructive: true,
        });
        expect(table.getText("schema").toString()).to.equal(destructiveSql);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).has("done")).to.equal(false);
        expect(undoManager.undoStack).to.have.length(1);

        undoManager.undo();
        expect(table.getText("schema").toString()).to.include("done BOOLEAN");
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("done")).to.equal(false);
    });

    it("updates Table records by stable ID atomically with quoted reserved columns and casting", async () => {
        const { service, table } = fixture();
        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(
            0,
            'CREATE TABLE tasks (id TEXT PRIMARY KEY, "order" INTEGER NOT NULL, '
                + "state TEXT CHECK (state IN ('open', 'done')))",
        );
        table.getMap("data").clear();
        for (const [id, order] of [["r1", 1], ["r2", 2]] as const) {
            const row = new Y.Map<string | number | null>();
            row.set("id", id);
            row.set("order", order);
            row.set("state", "open");
            table.getMap("data").set(id, row);
        }
        const before = await service.getTable("uid", "project-1", "table-1");

        // Order of the batch and of the underlying Y.Map never matters: each
        // change is addressed by its own recordId, never by row position.
        const result = await service.updateTableRecords("uid", "project-1", "table-1", [
            { recordId: "r2", values: { order: 20 } },
            { recordId: "r1", values: { order: 10, state: "done" } },
        ], { expectedRevision: before.revision });
        expect(result.applied).to.equal(true);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("order")).to.equal(10);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("state")).to.equal("done");
        expect((table.getMap("data").get("r2") as Y.Map<unknown>).get("order")).to.equal(20);
        expect(result.records.map((record: { recordId: string; }) => record.recordId).sort()).to.deep.equal([
            "r1",
            "r2",
        ]);

        await expectFailureCode(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { order: 30 } },
            ], { expectedRevision: before.revision }),
            "stale_revision",
        );

        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { bogus: 1 } },
            ], { expectedRevision: result.revision }),
            'Column "bogus"',
        );

        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { order: "not-a-number" } },
            ], { expectedRevision: result.revision }),
            "not a valid integer",
        );

        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { state: "archived" } },
            ], { expectedRevision: result.revision }),
            "violate",
        );

        // None of the rejected attempts left a partial write behind.
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("order")).to.equal(10);
    });

    it("rejects a batch that would introduce a new UNIQUE violation, without any partial write", async () => {
        const { service, table } = fixture();
        table.getText("schema").delete(0, table.getText("schema").length);
        table.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, code TEXT UNIQUE)");
        table.getMap("data").clear();
        for (const [id, code] of [["r1", "a"], ["r2", "b"]] as const) {
            const row = new Y.Map<string | null>();
            row.set("id", id);
            row.set("code", code);
            table.getMap("data").set(id, row);
        }
        const before = await service.getTable("uid", "project-1", "table-1");

        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { code: "b" } },
            ], { expectedRevision: before.revision }),
            "violate",
        );
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("code")).to.equal("a");
        expect((table.getMap("data").get("r2") as Y.Map<unknown>).get("code")).to.equal("b");
    });

    it("enforces batch size, payload, and record-identity limits for update_table_records", async () => {
        const { service } = fixture();
        const before = await service.getTable("uid", "project-1", "table-1");

        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [], { expectedRevision: before.revision }),
            "at least one",
        );
        const tooMany = Array.from({ length: 101 }, (_, index) => ({
            recordId: `r${index}`,
            values: { title: "x" },
        }));
        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", tooMany, { expectedRevision: before.revision }),
            "batch limit",
        );
        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { title: "x".repeat(70 * 1024) } },
            ], { expectedRevision: before.revision }),
            "byte limit",
        );
        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { title: "a" } },
                { recordId: "r1", values: { title: "b" } },
            ], { expectedRevision: before.revision }),
            "Duplicate recordId",
        );
        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "missing-record", values: { title: "x" } },
            ], { expectedRevision: before.revision }),
            "does not exist",
        );
        await expectFailure(
            service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { id: "different-id" } },
            ], { expectedRevision: before.revision }),
            "cannot change its own id",
        );
    });

    it("dry-runs and idempotently retries update_table_records", async () => {
        const { service, table } = fixture();
        const before = await service.getTable("uid", "project-1", "table-1");

        const dryRun = await service.updateTableRecords("uid", "project-1", "table-1", [
            { recordId: "r1", values: { title: "Should not persist" } },
        ], { expectedRevision: before.revision, dryRun: true });
        expect(dryRun.applied).to.equal(false);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("title")).to.equal("First");

        const args = [{ recordId: "r1", values: { title: "Persisted" } }];
        const first = await service.updateTableRecords("uid", "project-1", "table-1", args, {
            expectedRevision: before.revision,
            operationId: "records-op-1",
        });
        const second = await service.updateTableRecords("uid", "project-1", "table-1", args, {
            expectedRevision: before.revision,
            operationId: "records-op-1",
        });
        expect(first.replayed).to.equal(false);
        expect(second.replayed).to.equal(true);
        expect({ ...second, replayed: undefined }).to.deep.equal({ ...first, replayed: undefined });
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("title")).to.equal("Persisted");
    });

    it("fails closed for update_table_schema and update_table_records on an inaccessible project", async () => {
        const denied = fixture(false);
        await expectFailure(
            denied.service.updateTableSchema(
                "uid",
                "project-1",
                "table-1",
                "CREATE TABLE tasks (id TEXT PRIMARY KEY)",
                { expectedRevision: "any" },
            ),
            "inaccessible",
        );
        await expectFailure(
            denied.service.updateTableRecords("uid", "project-1", "table-1", [
                { recordId: "r1", values: { title: "x" } },
            ], { expectedRevision: "any" }),
            "inaccessible",
        );
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

async function expectFailureCode(promise: Promise<unknown>, code: string) {
    try {
        await promise;
        expect.fail("Expected operation to fail");
    } catch (error) {
        expect((error as { code?: string; }).code).to.equal(code);
    }
}
