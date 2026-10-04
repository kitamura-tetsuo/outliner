import { expect } from "chai";
import {
    deferred,
    type GridMcpFixture,
    settleMicrotasks,
    startGridMcpFixture,
    UID,
    updateArgs,
} from "./mcp-grid-presentation-mcp-fixture.js";
import { waitFor } from "./server-create-table-fixture.js";
import { PROJECT } from "./server-grid-presentation-fixture.js";

const MINUTE = 60 * 1000;

// Issue #5436 REQ-006: bounded replay — overlapping identical calls join one
// pending attempt, a lost response is recovered by replay, different input
// under the same identity is refused, and retention is five minutes measured
// from settlement (pending attempts never expire, retries never extend it).
describe("MCP update_grid_presentation replay (#5436 REQ-006)", function() {
    this.timeout(60000);
    let t: GridMcpFixture;

    beforeEach(async () => {
        t = await startGridMcpFixture();
    });
    afterEach(async () => {
        await t.stop();
    });

    const revision = async () =>
        (await t.mcp.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload.presentationRevision;

    /** Hold the next apply at the domain barrier; resolves once it is held there. */
    const holdAttempt = () => {
        const reached = deferred();
        const release = deferred();
        t.seams.beforeAttempt = async () => {
            reached.resolve();
            await release.promise;
        };
        return { reached: reached.promise, release: release.resolve };
    };

    /** Start a call and establish it joined without starting its own attempt. */
    const startFollower = async (args: object, requestId: string) => {
        let settled = false;
        const pending = t.mcp.call("update_grid_presentation", args, { requestId }).finally(() => settled = true);
        await waitFor(() => (t.checks.get(requestId) ?? 0) >= 1);
        // The ACL read and the replay join are in-process microtasks.
        await settleMicrotasks();
        await settleMicrotasks();
        expect(settled, "follower must still be waiting on the in-flight attempt").to.equal(false);
        expect(t.domainCalls, "follower must not start its own attempt").to.equal(1);
        // Wrapped: returning the promise itself would make the caller await it.
        return { pending };
    };

    it("joins one in-flight attempt, then replays the original outcome", async () => {
        const args = updateArgs({ expectedPresentationRevision: await revision() });
        const hold = holdAttempt();
        const leader = t.mcp.call("update_grid_presentation", args, { requestId: "leader" });
        await hold.reached;
        const { pending: follower } = await startFollower(args, "follower");
        hold.release();
        const [first, second] = await Promise.all([leader, follower]);
        expect(first.payload).to.include({ applied: true, replayed: false });
        expect(second.payload).to.deep.equal({ ...first.payload, replayed: true });
        expect(t.domainCalls).to.equal(1);

        // The first response is discarded (transport loss); the retry replays it.
        const retry = await t.mcp.call("update_grid_presentation", args);
        expect(retry.payload).to.deep.equal({ ...first.payload, replayed: true });
        expect(t.domainCalls).to.equal(1);

        // A replay never overwrites a later edit: it returns the original
        // outcome, and the live definition keeps the newer value.
        const newer = updateArgs({
            expectedPresentationRevision: first.payload.presentationRevision,
            changes: { components: { title: { label: "新しい件名" } } },
            operationId: "round-trip-2",
        });
        const applied = (await t.mcp.call("update_grid_presentation", newer)).payload;
        expect(applied).to.include({ applied: true, replayed: false });
        const stale = await t.mcp.call("update_grid_presentation", args);
        expect(stale.payload).to.deep.equal({ ...first.payload, replayed: true });
        expect(t.domainCalls).to.equal(2);
        const current = (await t.mcp.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        expect(current.presentation.components.title.label).to.equal("新しい件名");
    });

    it("rejects the same identity with different input without executing", async () => {
        const args = updateArgs({ expectedPresentationRevision: await revision(), operationId: "shared-id" });
        const first = (await t.mcp.call("update_grid_presentation", args)).payload;
        expect(first).to.include({ applied: true, replayed: false });

        for (
            const different of [
                { ...args, expectedPresentationRevision: "grid-presentation-v1:other" },
                { ...args, changes: { components: { title: { label: "別の件名" } } } },
                // Values stay exact: a trailing space is different input even
                // though it trims to the same label.
                { ...args, changes: { components: { title: { label: "件名 " } } } },
            ]
        ) {
            const refused = await t.mcp.call("update_grid_presentation", different);
            expect(refused.result.isError).to.equal(true);
            expect(refused.payload.code).to.equal("invalid_argument");
            expect(refused.payload.reason).to.equal("operation_id_reused");
        }
        expect(t.domainCalls).to.equal(1);

        // The retained entry is undisturbed: the original input still replays.
        const replay = (await t.mcp.call("update_grid_presentation", args)).payload;
        expect(replay).to.deep.equal({ ...first, replayed: true });
        expect(t.domainCalls).to.equal(1);
    });

    it("ignores object property order in the fingerprint", async () => {
        const base = updateArgs({
            expectedPresentationRevision: await revision(),
            changes: {
                name: "タスク",
                components: { done: { shown: false }, title: { label: "件名", shown: true } },
            },
            operationId: "order-insensitive",
        });
        const first = (await t.mcp.call("update_grid_presentation", base)).payload;
        expect(first).to.include({ applied: true, replayed: false });
        const reordered = {
            ...base,
            changes: {
                components: { title: { shown: true, label: "件名" }, done: { shown: false } },
                name: "タスク",
            },
        };
        expect((await t.mcp.call("update_grid_presentation", reordered)).payload).to.deep.equal({
            ...first,
            replayed: true,
        });
        expect(t.domainCalls).to.equal(1);
    });

    it("keeps a pending attempt joinable past five minutes and retains five minutes from settlement", async () => {
        let clock = 1_000_000;
        t.seams.now = () => clock;
        const args = updateArgs({ expectedPresentationRevision: await revision() });
        const hold = holdAttempt();
        const leader = t.mcp.call("update_grid_presentation", args, { requestId: "slow-leader" });
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
            expect((await t.mcp.call("update_grid_presentation", args)).payload).to.deep.equal({
                ...first.payload,
                replayed: true,
            });
        }
        expect(t.domainCalls).to.equal(1);

        // Exactly five minutes after settlement the entry has expired: a fresh
        // attempt runs, and the now-stale token is refused without retention.
        clock = settledAt + 5 * MINUTE;
        t.seams.beforeAttempt = undefined;
        const expired = await t.mcp.call("update_grid_presentation", args);
        expect(t.domainCalls).to.equal(2);
        expect(expired.result.isError).to.equal(true);
        expect(expired.payload.code).to.equal("stale_revision");
        expect(expired.payload.currentPresentationRevision).to.equal(first.payload.presentationRevision);
    });

    it("bypasses replay completely for dry runs", async () => {
        const expectedPresentationRevision = await revision();
        const preview = (await t.mcp.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision,
                changes: { components: { title: { label: "件名" } } },
                operationId: "preview-id",
                dryRun: true,
            }),
        )).payload;
        expect(preview).to.include({ applied: false, replayed: false, wouldChange: true });
        expect(t.domainCalls).to.equal(0);

        // The preview consumed nothing: the same identity applies different
        // input afterwards, and a retained apply never serves a preview.
        const applied = (await t.mcp.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision,
                changes: { components: { title: { label: "別の件名" } } },
                operationId: "preview-id",
            }),
        )).payload;
        expect(applied).to.include({ applied: true, replayed: false });
        const repeatedPreview = (await t.mcp.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: applied.presentationRevision,
                changes: { components: { title: { label: "別の件名" } } },
                operationId: "preview-id",
                dryRun: true,
            }),
        )).payload;
        expect(repeatedPreview).to.include({ applied: false, replayed: false, wouldChange: false });
    });

    it("retains a no-op withheld at disclosure and replays it after a peer edit", async () => {
        const expectedPresentationRevision = await revision();
        const args = updateArgs({
            expectedPresentationRevision,
            changes: { name: "Tasks" },
            operationId: "noop-withheld",
        });
        // Revoke exactly at the domain disclosure authorization (the fourth
        // project check of this apply: tool pre-replay, domain open, domain
        // final, then domain disclose). The established no-op must be
        // withheld without target metadata while staying retained.
        t.seams.gate = (requestId, check) => {
            if (requestId === "withheld-noop" && check === 4) t.acl.revokeAll(PROJECT);
        };
        const denied = await t.mcp.call("update_grid_presentation", args, { requestId: "withheld-noop" });
        expect(denied.result.isError).to.equal(true);
        expect(denied.payload.code).to.equal("forbidden");
        expect(denied.payload.requestId).to.be.a("string");
        expect(denied.payload).not.to.have.property("currentPresentationRevision");
        expect(JSON.stringify(denied.payload)).not.to.contain("grid-presentation-v1");
        expect(t.domainCalls, "the denied call must not invoke a second writer").to.equal(1);
        t.seams.gate = undefined;

        // A peer moves the live revision while access is restored.
        t.acl.grant("projectUsers", PROJECT, UID);
        const peer = updateArgs({
            expectedPresentationRevision,
            changes: { components: { title: { label: "Peer" } } },
            operationId: "noop-withheld-peer",
        });
        expect((await t.mcp.call("update_grid_presentation", peer)).payload).to.include({ applied: true });

        // The original no-op replays its established outcome instead of
        // re-executing against the moved revision: no fresh domain attempt, so
        // the peer edit is neither overwritten nor reported.
        const retry = await t.mcp.call("update_grid_presentation", args);
        expect(retry.payload).to.include({
            dryRun: false,
            applied: false,
            replayed: true,
            priorPresentationRevision: expectedPresentationRevision,
            presentationRevision: expectedPresentationRevision,
        });
        expect(t.domainCalls).to.equal(2);

        // The retained fingerprint still guards the identity: different input
        // under the same operation ID is refused without executing.
        const different = await t.mcp.call("update_grid_presentation", {
            ...args,
            changes: { name: "Changed" },
        });
        expect(different.result.isError).to.equal(true);
        expect(different.payload.code).to.equal("invalid_argument");
        expect(different.payload.reason).to.equal("operation_id_reused");
        expect(t.domainCalls).to.equal(2);
    });

    it("replays an accepted no-op instead of re-reading current state", async () => {
        const expectedPresentationRevision = await revision();
        const args = updateArgs({ expectedPresentationRevision, changes: { name: "Tasks" }, operationId: "noop-id" });
        const first = (await t.mcp.call("update_grid_presentation", args)).payload;
        expect(first).to.include({ applied: false, replayed: false });
        // A later edit moves the live revision, but the no-op replay still
        // returns the original outcome rather than a fresh snapshot.
        const edit = updateArgs({
            expectedPresentationRevision,
            changes: { name: "Renamed" },
            operationId: "noop-edit",
        });
        expect((await t.mcp.call("update_grid_presentation", edit)).payload).to.include({ applied: true });
        const replay = (await t.mcp.call("update_grid_presentation", args)).payload;
        expect(replay).to.deep.equal({ ...first, replayed: true });
        expect(replay.presentationRevision).to.equal(expectedPresentationRevision);
    });
});
