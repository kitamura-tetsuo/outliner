import { expect } from "chai";
import * as Y from "yjs";
import { validateAndPublishScheduleSql } from "../../src/scheduler/schedule-sql-diagnostics.js";

describe("saved Schedule SQL diagnostic publication", () => {
    it("publishes one input-bound refusal, makes repeats a no-op, and clears it after repair", () => {
        const doc = new Y.Doc();
        const rule = new Y.Map<unknown>();
        doc.getMap("schedules").set("rule-1", rule);
        rule.set("sql", "SELECT 1");
        rule.set("sqlAliasPolicyVersion", 2);
        let updates = 0;
        doc.on("update", () => updates++);

        const rejected = validateAndPublishScheduleSql(doc, "rule-1");
        expect(rejected?.validation).to.deep.equal({ valid: false, error: "Query must be an INSERT statement" });
        expect(JSON.parse(rule.get("sqlValidationDiagnostic") as string)).to.deep.equal({
            version: 1,
            sql: "SELECT 1",
            strictAliases: false,
            error: "Query must be an INSERT statement",
        });
        const afterFirstRefusal = updates;

        validateAndPublishScheduleSql(doc, "rule-1");
        expect(updates).to.equal(afterFirstRefusal);

        rule.set("sql", "INSERT INTO tasks (id) VALUES ('one') RETURNING *");
        const admitted = validateAndPublishScheduleSql(doc, "rule-1");
        expect(admitted?.validation.valid).to.equal(true);
        expect(rule.get("sqlValidationDiagnostic")).to.be.undefined;
    });
});
