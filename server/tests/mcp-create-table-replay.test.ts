import { expect } from "chai";
import {
    createArgs,
    deferred,
    type McpTestServer,
    settleMicrotasks,
    startMcpTestServer,
} from "./mcp-create-table-fixture.js";
import { waitFor } from "./server-create-table-fixture.js";

const MINUTE = 60 * 1000;

// Issue #5412 AS-004: overlapping identical calls join one in-flight attempt,
// a lost response is recovered by replay, and retention is five minutes
// measured from settlement (pending attempts never expire).
describe("MCP create_table replay and overlapping calls (#5412 AS-004)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    /** Hold the next apply at the publication barrier; resolves once it is held there. */
    const holdPublication = () => {
        const reached = deferred();
        const release = deferred();
        t.seams.beforePublication = async () => {
            reached.resolve();
            await release.promise;
        };
        return { reached: reached.promise, release: release.resolve };
    };

    /** Start a call and establish it passed authorization and joined without a second domain attempt. */
    const startFollower = async (args: object, requestId: string) => {
        let settled = false;
        const pending = t.mcp.call("create_table", args, { requestId }).finally(() => settled = true);
        await waitFor(() => (t.checks.get(requestId) ?? 0) >= 1);
        // The ACL read and the replay join are in-process microtasks.
        await settleMicrotasks();
        await settleMicrotasks();
        expect(settled, "follower must still be waiting on the in-flight attempt").to.equal(false);
        expect(t.domainCalls, "follower must not start its own attempt").to.equal(1);
        // Wrapped: returning the promise itself would make the caller await it.
        return { pending };
    };

    it("joins one in-flight attempt, then replays after a lost response", async () => {
        const args = createArgs();
        const before = Object.keys(await t.tables()).length;
        const hold = holdPublication();
        const leader = t.mcp.call("create_table", args, { requestId: "leader" });
        await hold.reached;
        expect(Object.keys(await t.tables())).to.have.length(before);
        const { pending: follower } = await startFollower(args, "follower");
        hold.release();
        const [first, second] = await Promise.all([leader, follower]);
        expect(first.payload).to.include({ applied: true, replayed: false });
        expect(second.payload).to.deep.equal({ ...first.payload, replayed: true });
        expect(t.domainCalls).to.equal(1);
        expect(Object.keys(await t.tables())).to.have.length(before + 1);

        // The first response is discarded (transport loss); the retry replays it.
        const retry = await t.mcp.call("create_table", args);
        expect(retry.payload).to.deep.equal({ ...first.payload, replayed: true });
        expect(t.domainCalls).to.equal(1);
        expect(Object.keys(await t.tables())).to.have.length(before + 1);
    });

    it("keeps a pending attempt joinable past five minutes and retains five minutes from settlement", async () => {
        let clock = 1_000_000;
        t.seams.now = () => clock;
        const args = createArgs();
        const hold = holdPublication();
        const leader = t.mcp.call("create_table", args, { requestId: "slow-leader" });
        await hold.reached;
        clock += 6 * MINUTE; // longer than retention, still pending
        const { pending: follower } = await startFollower(args, "late-follower");
        const settledAt = clock;
        hold.release();
        const [first, second] = await Promise.all([leader, follower]);
        expect(second.payload).to.deep.equal({ ...first.payload, replayed: true });

        // Retries inside the window replay and never extend it.
        for (const offset of [1 * MINUTE, 4 * MINUTE, 5 * MINUTE - 1]) {
            clock = settledAt + offset;
            expect((await t.mcp.call("create_table", args)).payload).to.deep.equal({
                ...first.payload,
                replayed: true,
            });
        }
        expect(t.domainCalls).to.equal(1);

        // Exactly five minutes after settlement the entry has expired: a new
        // attempt runs and is refused because the SQL name is now occupied.
        clock = settledAt + 5 * MINUTE;
        t.seams.beforePublication = undefined;
        const expired = await t.mcp.call("create_table", args);
        expect(t.domainCalls).to.equal(2);
        expect(expired.payload).to.include({
            code: "validation_failed",
            reason: "relation_name_unavailable",
            conflictingTableId: first.payload.tableId,
        });
        const tables = Object.values(await t.tables()).filter(table => table.sqlName === "mcp_tasks");
        expect(tables).to.have.length(1);
    });
});
