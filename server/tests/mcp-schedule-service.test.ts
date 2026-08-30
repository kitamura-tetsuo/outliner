import { expect } from "chai";
import * as Y from "yjs";
import { OutlinerScheduleService } from "../src/mcp/schedule-service.js";

describe("MCP Schedule diagnostics", () => {
    it("discovers, reads, previews, and updates a rule without preview mutation", async () => {
        const project = new Y.Doc();
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        project.getMap("yjsTables").set("table-1", table);
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
        const service = new OutlinerScheduleService({
            openDirectConnection: async () => ({ document: project, disconnect: async () => {} }),
        } as never, async () => true);

        const listed = await service.listSchedules("user", "project-1", "table-1");
        expect(listed.schedules[0]).to.include({ ruleId: "rule-1", enabled: false });
        const read = await service.getSchedule("user", "project-1", "rule-1");
        expect(read.stored).to.include({ sql: rule.get("sql"), lastRunStatus: "error" });
        expect(read.derived.nextOccurrences).to.have.length(2);
        const preview = await service.validate("user", "project-1", read.stored as never, "rule-1");
        expect(preview).to.include({ accepted: true, persisted: false });
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
    });
});
