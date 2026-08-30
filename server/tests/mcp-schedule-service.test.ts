import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import * as Y from "yjs";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { OutlinerScheduleService } from "../src/mcp/schedule-service.js";

describe("MCP Schedule diagnostics", function() {
    this.timeout(60_000);
    it("discovers, reads, previews, and updates a rule without preview mutation", async () => {
        const hocuspocus = new Hocuspocus({ name: "mcp-schedule-test", quiet: true });
        const connection = await hocuspocus.openDirectConnection("projects/project-1", { context: { uid: "user" } });
        const project = connection.document;
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        const restoredTable = new Y.Map<unknown>();
        restoredTable.set("name", "Tasks");
        restoredTable.set("sqlName", "tasks");
        project.getMap("yjsTables").set("table-1", restoredTable);
        const auditTable = new Y.Map<unknown>();
        auditTable.set("name", "Audit");
        auditTable.set("sqlName", "audit");
        project.getMap("yjsTables").set("audit-table", auditTable);
        const tableConnection = await hocuspocus.openDirectConnection("projects/project-1/tables/table-1", {
            context: { uid: "user" },
        });
        const tableDocument = tableConnection.document;
        tableDocument.getText("schema").insert(
            0,
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, occurrence_time TIMESTAMPTZ, occurrence_date DATE)",
        );
        const auditConnection = await hocuspocus.openDirectConnection("projects/project-1/tables/audit-table", {
            context: { uid: "user" },
        });
        auditConnection.document.getText("schema").insert(0, "CREATE TABLE audit (id TEXT PRIMARY KEY)");
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
        rule.set("sql", "INSERT INTO tasks (id) VALUES ('audit') RETURNING * -- audit");
        const literalAndComment = await service.listSchedules("user", "project-1", "audit-table", "sql-reference");
        expect(literalAndComment.schedules).to.deep.equal([]);
        const inspectedAudit = await relations.getTable("user", "project-1", "audit-table");
        expect(inspectedAudit.scheduleReferences).to.deep.equal([]);
        rule.set("sql", "INSERT INTO tasks (id) SELECT id FROM audit RETURNING *");
        const realReference = await service.listSchedules("user", "project-1", "audit-table", "sql-reference");
        expect(realReference.schedules[0]?.referenceKinds).to.deep.equal(["sql-reference"]);
        rule.set("sql", "INSERT INTO tasks (id) VALUES ('daily') RETURNING *");
        const read = await service.getSchedule("user", "project-1", "rule-1");
        expect(read.stored).to.include({ sql: rule.get("sql"), lastRunStatus: "error" });
        expect(read.derived.nextOccurrences).to.deep.equal([]);
        const preview = await service.validate("user", "project-1", read.stored as never, "rule-1");
        expect(preview).to.include({ accepted: true, persisted: false });
        expect(preview.candidateRows[0]).to.include({ id: "daily" });
        expect(preview.deterministicIds).to.include({ idempotent: true });
        expect(tableConnection.document.getMap("data").size).to.equal(0);
        const rejected = await service.validate("user", "project-1", {
            ...(read.stored as never),
            sql: "INSERT INTO missing_table (id) VALUES ('bad') RETURNING *",
        }, "rule-1");
        expect(rejected.accepted).to.equal(false);
        expect(rejected.candidateRows).to.deep.equal([]);
        const randomId = await service.validate("user", "project-1", {
            ...(read.stored as never),
            sql: "INSERT INTO tasks (id) VALUES (gen_random_uuid()) RETURNING *",
        }, "rule-1");
        expect(randomId.deterministicIds).to.include({ idempotent: false });
        for (
            const sql of [
                "INSERT INTO tasks (id) VALUES (nextval('task_ids')) RETURNING *",
                "INSERT INTO tasks DEFAULT VALUES RETURNING *",
            ]
        ) {
            const nondeterministic = await service.validate("user", "project-1", {
                ...(read.stored as never),
                sql,
            }, "rule-1");
            expect(nondeterministic.deterministicIds.idempotent).to.equal(false);
        }
        const occurrenceId = await service.validate(
            "user",
            "project-1",
            {
                ...(read.stored as never),
                sql: "INSERT INTO tasks (id) VALUES (current_setting('job.occurrence')) RETURNING *",
            },
            "rule-1",
            "2026-08-30T09:00:00Z",
        );
        expect(occurrenceId.deterministicIds.idempotent).to.equal(true);
        const randomIdWithOccurrenceColumn = await service.validate(
            "user",
            "project-1",
            {
                ...(read.stored as never),
                sql: "INSERT INTO tasks (id, occurrence_time) VALUES (random()::text, current_setting('job.occurrence')::timestamptz) RETURNING *",
            },
            "rule-1",
            "2026-08-30T09:00:00Z",
        );
        expect(randomIdWithOccurrenceColumn.deterministicIds.idempotent).to.equal(false);
        for (const occurrence of ["not-an-instant", "2026-08-30T09:00:00"]) {
            const invalidOccurrence = await service.validate(
                "user",
                "project-1",
                read.stored as never,
                "rule-1",
                occurrence,
            );
            expect(invalidOccurrence).to.include({ accepted: false });
            expect(invalidOccurrence.errors[0]).to.include({
                field: "occurrence",
                code: "invalid_occurrence",
            });
        }
        const unknownReturnedColumn = await service.validate(
            "user",
            "project-1",
            {
                ...(read.stored as never),
                sql: "INSERT INTO tasks (id) VALUES ('extra') RETURNING *, 7 AS bogus",
            },
            "rule-1",
            "2026-08-30T09:00:00Z",
        );
        expect(unknownReturnedColumn).to.include({ accepted: false });
        expect(unknownReturnedColumn.candidateRows).to.deep.equal([]);
        expect(unknownReturnedColumn.errors[0]).to.include({
            code: "unknown_target_column",
            column: "bogus",
        });
        auditConnection.document.getText("schema").delete(0, auditConnection.document.getText("schema").length);
        auditConnection.document.getText("schema").insert(
            0,
            "CREATE TABLE audit (id TEXT PRIMARY KEY, title TEXT NOT NULL, score INTEGER CHECK (score > 0))",
        );
        const wrongDestination = await service.validate(
            "user",
            "project-1",
            {
                ...(read.stored as never),
                targetTableId: "audit-table",
                sql: "INSERT INTO tasks (id) VALUES ('wrong-table') RETURNING *",
            },
            "rule-1",
            "2026-08-30T09:00:00Z",
        );
        expect(wrongDestination).to.include({ accepted: false });
        expect(wrongDestination.errors[0]).to.include({ code: "wrong_target_relation" });
        for (
            const sql of [
                "INSERT INTO audit (id) VALUES ('missing-title') RETURNING *",
                "INSERT INTO audit (id, title, score) VALUES ('bad-score', 'Bad', -1) RETURNING *",
            ]
        ) {
            const constraintFailure = await service.validate(
                "user",
                "project-1",
                { ...(read.stored as never), targetTableId: "audit-table", sql },
                "rule-1",
                "2026-08-30T09:00:00Z",
            );
            expect(constraintFailure).to.include({ accepted: false });
            expect(constraintFailure.errors[0]).to.include({ phase: "execution" });
        }
        const timezoneSensitive = await service.validate(
            "user",
            "project-1",
            {
                ...(read.stored as never),
                timezone: "America/Los_Angeles",
                sql: "INSERT INTO tasks (id, occurrence_date) VALUES ('zoned', current_setting('job.occurrence')::timestamptz::date) RETURNING *",
            },
            "rule-1",
            "2026-01-01T02:00:00Z",
        );
        expect(timezoneSensitive.candidateRows[0]).to.include({ occurrence_date: "2025-12-31T00:00:00.000Z" });
        const malformed = new Y.Map<string | number>();
        malformed.set("title", "Existing");
        malformed.set("score", "not-an-integer");
        auditConnection.document.getMap("data").set("malformed", malformed);
        const materializationCandidate = {
            ...(read.stored as never),
            targetTableId: "audit-table",
            sql: "INSERT INTO audit (id, title, score) VALUES ('new', 'New', 1) RETURNING *",
        };
        const materializationPreview = await service.validate(
            "user",
            "project-1",
            materializationCandidate,
            "rule-1",
            "2026-08-30T09:00:00Z",
        );
        expect(materializationPreview).to.include({ accepted: false });
        expect(materializationPreview.candidateRows).to.deep.equal([]);
        expect(materializationPreview.errors[0]).to.include({ phase: "materialization" });
        auditConnection.document.getMap("data").delete("malformed");
        const firstTargetRevision = preview.revisions.targetTable;
        tableDocument.getText("schema").insert(tableDocument.getText("schema").length, " ");
        const afterSchemaEdit = await service.validate("user", "project-1", read.stored as never, "rule-1");
        expect(afterSchemaEdit.revisions.targetTable).not.to.equal(firstTargetRevision);
        rule.set("enabled", true);
        rule.set("catchUp", false);
        rule.set("rrule", "FREQ=HOURLY");
        rule.set("dtstart", "2024-01-01T00:00:00");
        const longRunning = await service.getSchedule("user", "project-1", "rule-1");
        expect(longRunning.derived.nextOccurrences).to.have.length(5);
        expect(longRunning.derived.nextOccurrences.every(instant => Date.parse(instant) > Date.now())).to.equal(true);
        rule.set("enabled", false);
        rule.set("rrule", "FREQ=DAILY;COUNT=2");
        rule.set("dtstart", "2026-08-30T09:00:00");
        project.getMap("yjsTables").delete("table-1");
        const missingTarget = await service.getSchedule("user", "project-1", "rule-1");
        expect(missingTarget.stored).to.include({ sql: rule.get("sql"), lastRunStatus: "error" });
        expect(missingTarget.derived.validation.targetTable).to.deep.include({ valid: false });
        expect(missingTarget.derived.validation.targetTable.error).to.include({ code: "missing_target" });
        project.getMap("yjsTables").set("table-1", table);
        expect(rule.get("enabled")).to.equal(false);
        const currentBeforeUpdate = await service.getSchedule("user", "project-1", "rule-1");
        const updated = await service.update(
            "user",
            "project-1",
            "rule-1",
            { sql: "INSERT INTO tasks (id) VALUES ('fixed') RETURNING *" },
            currentBeforeUpdate.revision,
        );
        expect(updated).to.include({ applied: true });
        expect(rule.get("enabled")).to.equal(false);
        rule.set("enabled", true);
        rule.set("completedAt", "2026-08-30T10:00:00Z");
        expect((await service.getSchedule("user", "project-1", "rule-1")).derived.nextOccurrences).to.deep.equal([]);
        rule.delete("completedAt");
        rule.set("catchUp", false);
        rule.set("dtstart", "2099-01-01T09:00:00");
        rule.set("rrule", "FREQ=DAILY;COUNT=2");
        expect((await service.getSchedule("user", "project-1", "rule-1")).derived.nextOccurrences).to.have.length(2);
        rule.set("catchUp", true);
        rule.set("dtstart", "2026-03-08T02:30:00");
        rule.set("timezone", "America/New_York");
        expect((await service.getSchedule("user", "project-1", "rule-1")).derived.nextOccurrences).to.deep.equal([]);
        await auditConnection.disconnect();
        await tableConnection.disconnect();
        await connection.disconnect();
        hocuspocus.closeConnections();
        await hocuspocus.unloadDocument(tableDocument);
        await hocuspocus.unloadDocument(project);
        hocuspocus.documents.clear();
    });
});
