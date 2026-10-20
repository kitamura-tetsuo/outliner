import { expect } from "chai";
import * as Y from "yjs";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";

describe("native Grid trace physical identities", function() {
    this.timeout(30000);
    it("keeps verified row attribution independent of INSERT preference with overlapping IDs", async () => {
        const f = httpGridFixture();
        f.people.getMap("data").clear();
        const person = new Y.Map<unknown>();
        person.set("id", "t1");
        person.set("label", "B");
        f.people.getMap("data").set("t1", person);
        const query =
            "SELECT 'tasks' AS source_kind, id AS source_id, title AS value FROM tasks UNION ALL SELECT 'people', id, label FROM people ORDER BY source_kind, source_id";
        const identities: unknown[][] = [];
        for (const target of ["table-tasks", "table-people"]) {
            const created =
                (await f.call("create_grid", { ...f.args, query, insertTargetTableId: target, operationId: target }))
                    .payload;
            const trace = (await f.call("trace_grid", { projectId: f.args.projectId, gridId: created.gridId })).payload;
            const rows = trace.stages.find((stage: { stage: string; }) => stage.stage === "query-execution").rows;
            expect(rows[0].identity).to.deep.include({ kind: "source", relation: "people", value: "t1" });
            expect(rows[0].identity.source.id).to.equal("table-people");
            identities.push(rows.map((row: { identity: unknown; }) => row.identity));
        }
        expect(identities[0]).to.deep.equal(identities[1]);
    });
    it("does not route a forged claim onto another UNION branch", async () => {
        const f = httpGridFixture();
        const query =
            "SELECT 'people' AS source_kind, id AS source_id, title AS value FROM tasks UNION ALL SELECT 'people', id, label FROM people";
        const created = (await f.call("create_grid", { ...f.args, query })).payload;
        const trace = (await f.call("trace_grid", { projectId: f.args.projectId, gridId: created.gridId })).payload;
        const rows = trace.stages.find((stage: { stage: string; }) => stage.stage === "query-execution").rows;
        expect(trace.stages.find((stage: { stage: string; }) => stage.stage === "query-execution").editability.editable)
            .to.equal(false);
        expect(rows).to.have.length(4);
        for (const row of rows) expect(row.identity.kind).to.equal("result-ordinal");
        expect(trace.sourceDiagnostics.provenance.branches[0].routedIdentity).to.equal(false);
    });
});
