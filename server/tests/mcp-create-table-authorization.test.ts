import { expect } from "chai";
import {
    createArgs,
    deferred,
    type McpTestServer,
    PROJECT,
    settleMicrotasks,
    startMcpTestServer,
    token,
    UID,
} from "./mcp-create-table-fixture.js";
import { waitFor } from "./server-create-table-fixture.js";

const MINUTE = 60 * 1000;

/** A forbidden response discloses nothing about any creation. */
function expectBareForbidden(response: { result: { isError?: boolean; }; payload: Record<string, unknown>; }) {
    expect(response.result.isError).to.equal(true);
    expect(response.payload.code).to.equal("forbidden");
    expect(response.payload.requestId).to.be.a("string");
    for (const field of ["tableId", "creationOutcome", "applied", "replayed", "revision", "sqlName", "outcome"]) {
        expect(response.payload, field).not.to.have.property(field);
    }
}

// Issue #5412 AS-007: authorization before replay lookup, before publication,
// and before disclosure, using the real resource-side ACL adapter.
describe("MCP create_table authorization boundaries (#5412 AS-007)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    it("rejects a read-only token before argument validation, and denied or failing ACLs", async () => {
        const readOnly = token(UID, "outliner.read");
        for (const args of [createArgs(), { ...createArgs(), schemaSql: 42, extra: true }]) {
            const response = await t.mcp.call("create_table", args, { bearer: readOnly });
            expectBareForbidden(response);
            expect(response.result._meta["mcp/www_authenticate"]).to.contain('error="insufficient_scope"');
            expect(response.result._meta["mcp/www_authenticate"]).to.contain('scope="outliner.write"');
        }
        expectBareForbidden(await t.mcp.call("create_table", createArgs(), { bearer: token("stranger") }));
        t.acl.failing = true;
        expectBareForbidden(await t.mcp.call("create_table", createArgs()));
        t.acl.failing = false;
        expect(t.domainCalls).to.equal(0);
        // The legacy containerUsers grant is also resource-side authorization.
        t.acl.revokeAll(PROJECT);
        t.acl.grant("containerUsers", PROJECT, UID);
        expect((await t.mcp.call("create_table", createArgs())).payload.applied).to.equal(true);
    });

    it("rechecks the grant before publication and publishes nothing once it is revoked", async () => {
        const args = createArgs();
        const before = await t.tables();
        t.seams.beforePublication = async () => t.acl.revokeAll(PROJECT);
        expectBareForbidden(await t.mcp.call("create_table", args));
        expect(await t.tables()).to.deep.equal(before);
        // A confirmed refusal is not retained: the same operation ID may run again.
        t.seams.beforePublication = undefined;
        t.acl.grant("projectUsers", PROJECT, UID);
        expect((await t.mcp.call("create_table", args)).payload).to.include({ applied: true, replayed: false });
        expect(t.domainCalls).to.equal(2);
    });

    for (const kind of ["created", "unknown"] as const) {
        it(`withholds a retained ${kind} result from a denied retry without touching retention`, async () => {
            let clock = 1_000_000;
            t.seams.now = () => clock;
            const args = createArgs();
            if (kind === "unknown") {
                t.seams.afterStore = room => {
                    if (room === `projects/${PROJECT}`) throw new Error("acknowledgement lost");
                };
            }
            const original = (await t.mcp.call("create_table", args)).payload;
            t.seams.afterStore = undefined;
            expect(original.tableId).to.be.a("string");

            t.acl.revokeAll(PROJECT);
            // Denied after the window: a lookup would expire the entry, a denial must not.
            clock += 10 * MINUTE;
            expectBareForbidden(await t.mcp.call("create_table", args));
            t.acl.failing = true;
            expectBareForbidden(await t.mcp.call("create_table", args));
            t.acl.failing = false;

            t.acl.grant("projectUsers", PROJECT, UID);
            clock -= 10 * MINUTE;
            const replay = await t.mcp.call("create_table", args);
            // Error payloads carry their own request's correlation ID.
            const correlation = kind === "unknown" ? { requestId: replay.payload.requestId } : {};
            expect(replay.payload).to.deep.equal({ ...original, replayed: true, ...correlation });
            expect(t.domainCalls).to.equal(1);
        });
    }

    it("withholds an awaited result from a follower revoked before disclosure", async () => {
        const args = createArgs();
        const reached = deferred();
        const release = deferred();
        t.seams.beforePublication = async () => {
            reached.resolve();
            await release.promise;
        };
        const leader = t.mcp.call("create_table", args, { requestId: "leader" });
        await reached.promise;
        const atDisclosure = deferred();
        const resume = deferred();
        t.seams.gate = async (requestId, check) => {
            if (requestId !== "follower" || check !== 2) return;
            atDisclosure.resolve();
            await resume.promise;
        };
        const follower = t.mcp.call("create_table", args, { requestId: "follower" });
        await waitFor(() => (t.checks.get("follower") ?? 0) >= 1);
        await settleMicrotasks();
        expect(t.domainCalls, "the follower joined instead of starting an attempt").to.equal(1);

        release.resolve();
        const first = await leader;
        expect(first.payload).to.include({ applied: true, replayed: false });
        await atDisclosure.promise;
        t.acl.revokeAll(PROJECT);
        resume.resolve();
        const withheld = await follower;
        expectBareForbidden(withheld);
        expect(JSON.stringify(withheld.result)).not.to.contain(first.payload.tableId);

        // The authorized creation stays, and so does its retained outcome.
        expect((await t.tables())[first.payload.tableId]).to.deep.equal({ name: "MCP Tasks", sqlName: "mcp_tasks" });
        t.acl.grant("projectUsers", PROJECT, UID);
        const replay = await t.mcp.call("create_table", args);
        expect(replay.payload).to.deep.equal({ ...first.payload, replayed: true });
        expect(t.domainCalls).to.equal(1);
    });
});
