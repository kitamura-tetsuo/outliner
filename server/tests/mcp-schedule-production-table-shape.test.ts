import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import * as Y from "yjs";
import { revisionOf } from "../src/mcp/mutation-contract.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { OutlinerScheduleService } from "../src/mcp/schedule-service.js";

// Covers GitHub issue #5258 ("Prevent get_schedule internal_failure on
// production Table descriptors"): a production yjsTables registry entry
// carries a live `doc: Y.Doc` subdocument reference (see createTable in
// client/src/services/yjstable/tableDocs.ts), which earlier Schedule test
// fixtures omitted. OutlinerScheduleService.references() used to hash that
// whole registry entry (Object.fromEntries(table.entries())), feeding the
// runtime Y.Doc into revisionOf's generic canonicalizer and crashing with a
// stack overflow instead of returning a revision. These tests reproduce the
// production registry shape so a regression here fails loudly again.
describe("MCP Schedule diagnostics on production-shaped Table descriptors (issue #5258)", function() {
    this.timeout(30_000);

    // The exact SQL fragment from the issue: a missing comma between
    // "order" and title makes Postgres read `"order" title` as an implicit
    // alias. get_schedule must remain a safe read regardless.
    const MISSING_COMMA_SQL = [
        "SELECT",
        "    id,",
        "    template_id,",
        '    "order"',
        "    title,",
        "    cadence,",
        "    to_char(occurrence_date, 'YYYY-MM-DD') AS occurrence_date,",
        "    done",
        "FROM inserted",
    ].join("\n");

    async function buildProject() {
        const hocuspocus = new Hocuspocus({ name: "mcp-schedule-prod-shape-test", quiet: true });
        const projectConnection = await hocuspocus.openDirectConnection("projects/project-1", {
            context: { uid: "user" },
        });
        const project = projectConnection.document;

        const tableEntry = new Y.Map<unknown>();
        tableEntry.set("name", "Tasks");
        tableEntry.set("sqlName", "tasks");
        tableEntry.set("doc", new Y.Doc({ guid: "table-1-registry-doc", autoLoad: true }));
        project.getMap("yjsTables").set("table-1", tableEntry);

        const tableConnection = await hocuspocus.openDirectConnection("projects/project-1/tables/table-1", {
            context: { uid: "user" },
        });
        tableConnection.document.getText("schema").insert(
            0,
            'CREATE TABLE tasks (id TEXT PRIMARY KEY, template_id TEXT, "order" INTEGER, title TEXT, '
                + "cadence TEXT, occurrence_date DATE, done BOOLEAN)",
        );

        const rule = new Y.Map<unknown>();
        rule.set("name", "Daily import");
        rule.set("targetTableId", "table-1");
        rule.set(
            "sql",
            "INSERT INTO tasks (id, \"order\") VALUES (current_setting('job.occurrence'), 1) RETURNING *",
        );
        rule.set("rrule", "FREQ=DAILY");
        rule.set("dtstart", "2099-01-01T09:00:00");
        rule.set("timezone", "UTC");
        rule.set("enabled", true);
        project.getMap("schedules").set("rule-1", rule);

        const canAccess = async (uid: string) => uid === "user";
        const relations = new OutlinerRelationService(hocuspocus, canAccess);
        const schedules = new OutlinerScheduleService(hocuspocus, canAccess, relations);
        return { hocuspocus, projectConnection, tableConnection, relations, schedules, rule };
    }

    it(
        "returns normally instead of internal_failure for a Schedule targeting a Table with a live doc subdocument (AC-001)",
        async () => {
            const { hocuspocus, projectConnection, tableConnection, schedules } = await buildProject();
            const read = await schedules.getSchedule("user", "project-1", "rule-1");
            expect(read.ruleId).to.equal("rule-1");
            expect(read.stored).to.include({ targetTableId: "table-1" });
            expect(read.derived.referencedTables[0]).to.include({ tableId: "table-1", kind: "write-target" });
            expect(read.derived.referencedTables[0].revision).to.be.a("string").with.lengthOf(16);

            await tableConnection.disconnect();
            await projectConnection.disconnect();
            hocuspocus.closeConnections();
        },
    );

    it(
        "reports the write-target Table revision using the same authoritative semantics as get_table (AC-002, AC-003 REQ-007)",
        async () => {
            const { hocuspocus, projectConnection, tableConnection, relations, schedules, rule } = await buildProject();
            const read = await schedules.getSchedule("user", "project-1", "rule-1");
            const table = await relations.getTable("user", "project-1", "table-1");
            expect(read.derived.referencedTables[0].revision).to.equal(table.revision);

            // Changing the Table's schema changes the authoritative revision
            // reported by both surfaces identically.
            tableConnection.document.getText("schema").insert(
                tableConnection.document.getText("schema").length,
                " ",
            );
            const readAfterSchemaEdit = await schedules.getSchedule("user", "project-1", "rule-1");
            const tableAfterSchemaEdit = await relations.getTable("user", "project-1", "table-1");
            expect(readAfterSchemaEdit.derived.referencedTables[0].revision).to.equal(tableAfterSchemaEdit.revision);
            expect(readAfterSchemaEdit.derived.referencedTables[0].revision).not.to.equal(table.revision);

            // Changing an unrelated Schedule field changes the Schedule's own
            // revision but must not change the Table's reported revision.
            rule.set("name", "Renamed import");
            const readAfterRename = await schedules.getSchedule("user", "project-1", "rule-1");
            expect(readAfterRename.revision).not.to.equal(readAfterSchemaEdit.revision);
            expect(readAfterRename.derived.referencedTables[0].revision).to.equal(
                readAfterSchemaEdit.derived.referencedTables[0].revision,
            );

            await tableConnection.disconnect();
            await projectConnection.disconnect();
            hocuspocus.closeConnections();
        },
    );

    it("keeps the exact stored SQL readable and reports validation diagnostics rather than crashing (AC-003, REQ-004)", async () => {
        const { hocuspocus, projectConnection, tableConnection, schedules, rule } = await buildProject();
        rule.set("sql", MISSING_COMMA_SQL);
        const read = await schedules.getSchedule("user", "project-1", "rule-1");
        expect(read.stored.sql).to.equal(MISSING_COMMA_SQL);
        expect(read.derived.validation.sql).to.include({ valid: false });

        await tableConnection.disconnect();
        await projectConnection.disconnect();
        hocuspocus.closeConnections();
    });

    it(
        "inspects dependencies without throwing for SQL using quoted identifiers and current_setting('job.occurrence') (AC-004)",
        async () => {
            const { hocuspocus, projectConnection, tableConnection, schedules } = await buildProject();
            const read = await schedules.getSchedule("user", "project-1", "rule-1");
            expect(read.derived.validation.sql).to.include({ valid: true });
            expect(read.derived.referencedTables.map(reference => reference.tableId)).to.include("table-1");

            await tableConnection.disconnect();
            await projectConnection.disconnect();
            hocuspocus.closeConnections();
        },
    );

    it("never mutates the Schedule, Table, or their revisions while producing diagnostics (AC-009, REQ-008)", async () => {
        const { hocuspocus, projectConnection, tableConnection, relations, schedules, rule } = await buildProject();
        const before = await schedules.getSchedule("user", "project-1", "rule-1");
        const tableBefore = await relations.getTable("user", "project-1", "table-1");
        await schedules.getSchedule("user", "project-1", "rule-1");
        await schedules.getSchedule("user", "project-1", "rule-1");
        const after = await schedules.getSchedule("user", "project-1", "rule-1");
        const tableAfter = await relations.getTable("user", "project-1", "table-1");
        expect(after.revision).to.equal(before.revision);
        expect(after.stored).to.deep.equal(before.stored);
        expect(tableAfter.revision).to.equal(tableBefore.revision);
        expect(rule.get("sql")).to.equal(before.stored.sql);

        await tableConnection.disconnect();
        await projectConnection.disconnect();
        hocuspocus.closeConnections();
    });

    it("fails fast with a clear error rather than recursing when revisionOf is passed a runtime object", () => {
        expect(() => revisionOf({ doc: new Y.Doc() })).to.throw(TypeError, /cannot hash a Doc object/i);
    });
});
