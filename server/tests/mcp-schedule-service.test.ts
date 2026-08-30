import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import * as Y from "yjs";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { OutlinerScheduleService } from "../src/mcp/schedule-service.js";

describe("MCP Schedule diagnostics", () => {
    it("discovers, reads, previews, and updates a rule without preview mutation", async () => {
        const hocuspocus = new Hocuspocus({ name: "mcp-schedule-test" });
        const connection = await hocuspocus.openDirectConnection("projects/project-1", { context: { uid: "user" } });
        const project = connection.document;
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        project.getMap("yjsTables").set("table-1", table);
        const tableConnection = await hocuspocus.openDirectConnection("projects/project-1/tables/table-1", {
            context: { uid: "user" },
        });
        const tableDocument = tableConnection.document;
        tableDocument.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY)");
        const rule = new Y.Map<unknown>();
        rule.set("name", "Daily tasks");
        rule.set("targetTableId", "table-1");
        rule.set("sql", "INSERT INTO tasks (id) VALUES ('daily') RETURNING *");
        rule.set("rrule", "FREQ=DAILY;COUNT=2");
        rule.set("dtstart", "2026-08-30T09:00:00");
        rule.set("timezone", "UTC");
        rule.set("enabled", false);
        rule.set("catchUp", true);
        rule.set("lastRunStatus", "error");
        project.getMap("schedules").set("rule-1", rule);
        const accessibleUsers = new Set(["user"]);
        const canAccess = async (uid: string) => accessibleUsers.has(uid);
        const relations = new OutlinerRelationService(hocuspocus, canAccess);
        const service = new OutlinerScheduleService(hocuspocus, canAccess, relations);

        const listed = await service.listSchedules("user", "project-1", "table-1");
        expect(listed.schedules[0]).to.include({ ruleId: "rule-1", enabled: false });
        expect(listed.schedules[0].referenceKinds).to.deep.equal(["write-target"]);
        const readOnlyReferences = await service.listSchedules(
            "user",
            "project-1",
            "table-1",
            "sql-reference",
        );
        expect(readOnlyReferences.schedules).to.deep.equal([]);
        const read = await service.getSchedule("user", "project-1", "rule-1");
        expect(read.stored).to.include({ sql: rule.get("sql"), lastRunStatus: "error" });
        expect(read.derived.nextOccurrences).to.have.length(2);
        const preview = await service.validate("user", "project-1", read.stored as never, "rule-1");
        expect(preview).to.include({ accepted: true, persisted: false });
        expect(preview.candidateRows).to.deep.equal([{ id: "daily" }]);
        expect(tableConnection.document.getMap("data").size).to.equal(0);
        const rejected = await service.validate("user", "project-1", {
            ...(read.stored as never),
            sql: "INSERT INTO missing_table (id) VALUES ('bad') RETURNING *",
        }, "rule-1");
        expect(rejected.accepted).to.equal(false);
        expect(rejected.candidateRows).to.deep.equal([]);
        expect(rule.get("enabled")).to.equal(false);
        const updated = await service.update(
            "user",
            "project-1",
            "rule-1",
            { sql: "INSERT INTO tasks (id) VALUES ('fixed') RETURNING *" },
            read.revision,
        );
        expect(updated).to.include({ applied: true });
        expect(rule.get("enabled")).to.equal(false);
        await tableConnection.disconnect();
        await connection.disconnect();
        hocuspocus.closeConnections();
        await hocuspocus.unloadDocument(tableDocument);
        await hocuspocus.unloadDocument(project);
    });
});
