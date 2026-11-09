import { expect } from "chai";
import {
    auditRecords,
    createArgs,
    type McpTestServer,
    PROJECT,
    startMcpTestServer,
    token,
    UID,
} from "./mcp-create-table-fixture.js";

const SCHEMA = "CREATE TABLE audit_rows (id TEXT, note TEXT CHECK (note <> 'SCHEMA-SECRET-7f3a'))";
const ROW_SECRET = "ROW-SECRET-91c2";

// Issue #5412 AS-010 (and the audit halves of AS-006/AS-007): every create_table
// dispatch is audited with its truthful effect, including unknown and withheld
// outcomes, without schema SQL, record values, bearer tokens, or raw UIDs.
describe("MCP create_table audit records (#5412 AS-010)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    it("records every outcome truthfully and without private payloads", async () => {
        const run = `audit-${crypto.randomUUID()}`;
        const id = (name: string) => `${run}-${name}`;
        const bearer = token();
        const call = (args: object) => t.mcp.call("create_table", args, { bearer });

        const preview = await call(createArgs({ schemaSql: SCHEMA, operationId: id("dry"), dryRun: true }));
        const applied = (await call(createArgs({ schemaSql: SCHEMA, operationId: id("apply") }))).payload;
        await call(createArgs({ schemaSql: SCHEMA, operationId: id("apply") }));
        await t.mcp.call("write_relation", {
            projectId: PROJECT,
            relation: "audit_rows",
            write: { op: "INSERT", values: { id: "r1", note: ROW_SECRET } },
        }, { bearer });
        await call({ ...createArgs({ operationId: id("malformed") }), schemaSql: 42 });
        t.acl.revokeAll(PROJECT);
        await call(createArgs({ schemaSql: SCHEMA, operationId: id("denied") }));
        t.acl.grant("projectUsers", PROJECT, UID);

        t.seams.afterStore = room => {
            if (room.includes("/tables/")) throw new Error("table store failed");
        };
        await call(createArgs({ schemaSql: "CREATE TABLE refused (id TEXT)", operationId: id("refused") }));
        t.seams.afterStore = room => {
            if (room === `projects/${PROJECT}`) throw new Error("acknowledgement lost");
        };
        const unknown =
            (await call(createArgs({ schemaSql: "CREATE TABLE maybe (id TEXT)", operationId: id("unknown") })))
                .payload;
        await call(createArgs({ schemaSql: "CREATE TABLE maybe (id TEXT)", operationId: id("unknown") }));
        // Access is revoked after the authorized publication was stored.
        t.seams.afterStore = room => {
            if (room === `projects/${PROJECT}`) t.acl.revokeAll(PROJECT);
        };
        const withheld = await call(
            createArgs({ schemaSql: "CREATE TABLE withheld (id TEXT)", operationId: id("withheld") }),
        );
        t.seams.afterStore = undefined;
        expect(withheld.payload.code).to.equal("forbidden");
        expect(withheld.payload).not.to.have.property("tableId");
        const withheldId = Object.entries(await t.tables()).find(([, table]) => table.sqlName === "withheld")![0];

        const records = await auditRecords(
            ["dry", "apply", "malformed", "denied", "refused", "unknown", "withheld"].map(id),
        );
        const summary = records.map(record => ({
            operationId: record.operationId.slice(run.length + 1),
            dryRun: record.dryRun,
            outcome: record.outcome,
            applied: record.applied,
            replayed: record.replayed,
            creationOutcome: record.creationOutcome,
            entity: record.entity,
            newRevision: record.newRevision,
        }));
        const created = { entity: `table:${applied.tableId}`, newRevision: applied.revision };
        const uncertain = { entity: `table:${unknown.tableId}`, newRevision: undefined };
        const none = { creationOutcome: undefined, entity: undefined, newRevision: undefined };
        const rows: Record<string, unknown>[] = [
            { operationId: "dry", dryRun: true, outcome: "success", applied: false, replayed: false, ...none },
            {
                operationId: "apply",
                outcome: "success",
                applied: true,
                replayed: false,
                creationOutcome: "created",
                ...created,
            },
            {
                operationId: "apply",
                outcome: "success",
                applied: true,
                replayed: true,
                creationOutcome: "created",
                ...created,
            },
            { operationId: "malformed", outcome: "invalid_argument", applied: false, replayed: false, ...none },
            { operationId: "denied", outcome: "forbidden", applied: false, replayed: false, ...none },
            {
                operationId: "refused",
                outcome: "internal_failure",
                applied: false,
                replayed: false,
                ...none,
                creationOutcome: "not_created",
            },
            {
                operationId: "unknown",
                outcome: "internal_failure",
                applied: null,
                replayed: false,
                creationOutcome: "unknown",
                ...uncertain,
            },
            {
                operationId: "unknown",
                outcome: "internal_failure",
                applied: null,
                replayed: true,
                creationOutcome: "unknown",
                ...uncertain,
            },
            {
                operationId: "withheld",
                outcome: "forbidden",
                applied: true,
                replayed: false,
                creationOutcome: "created",
                entity: `table:${withheldId}`,
            },
        ];
        expect(summary.map(({ newRevision: _revision, ...row }) => row)).to.deep.equal(
            rows.map(({ newRevision: _revision, ...row }) => ({ dryRun: false, ...row })),
        );
        for (const [index, row] of rows.entries()) {
            if ("newRevision" in row) {
                expect(summary[index].newRevision, String(row.operationId)).to.equal(row.newRevision);
            }
        }
        expect(summary[8].newRevision).to.be.a("string");
        expect(preview.payload).not.to.have.property("revision");
        for (const record of records) {
            expect(record).to.include({ tool: "create_table", projectId: PROJECT });
            expect(record.requestId).to.be.a("string");
            expect(record.uidFingerprint).to.match(/^[0-9a-f]{12}$/);
        }
        const serialized = JSON.stringify(records);
        for (const secret of ["SCHEMA-SECRET-7f3a", "CREATE TABLE", ROW_SECRET, bearer, UID]) {
            expect(serialized).not.to.contain(secret);
        }
    });
});
