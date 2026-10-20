import { expect } from "chai";
import { describe, it } from "mocha";
import * as Y from "yjs";
import type { IdempotencyCache } from "../src/mcp/mutation-contract.js";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";
import {
    auditReader,
    deferred,
    type Fixture,
    holdCleanup,
    pauseValidation,
    snapshot,
} from "./mcp-grid-repair-fixture.js";

async function updateArgs(f: Fixture) {
    const created = (await f.call("create_grid", f.args)).payload;
    return {
        projectId: "project-1",
        gridId: created.gridId,
        query: "SELECT id AS id, title AS title FROM tasks WHERE id = 't1'",
        expectedRevision: created.revision,
        operationId: crypto.randomUUID(),
    };
}
function withheld(result: unknown) {
    for (
        const secret of [
            "tasks",
            "Write spec",
            "sampleRows",
            "sourceDiagnostics",
            "validation",
            "protected cleanup failure",
        ]
    ) {
        expect(JSON.stringify(result)).not.to.contain(secret);
    }
}
describe("Grid query replay admission, disclosure and accepted cleanup", function() {
    this.timeout(30000);
    const audits = auditReader();
    it("denies completed replay before cache lookup and retains the accepted receipt", async () => {
        const f = httpGridFixture(), args = await updateArgs(f);
        const accepted = (await f.call("update_grid_query", args)).payload;
        expect(accepted).to.include({ applied: true, replayed: false });
        const before = snapshot(f);
        f.access.allowed = false;
        const denied = await f.call("update_grid_query", args);
        expect(denied.payload.code).to.equal("forbidden");
        withheld(denied);
        expect(snapshot(f)).to.deep.equal(before);
        f.access.allowed = true;
        expect((await f.call("update_grid_query", args)).payload).to.deep.equal({ ...accepted, replayed: true });
        expect(snapshot(f)).to.deep.equal(before);
        expect((await audits(args.operationId)).map(record => [record.outcome, record.applied, record.replayed])).to
            .deep.equal([
                ["success", true, false],
                ["forbidden", false, false],
                ["success", true, true],
            ]);
    });
    it("withholds an admitted in-flight replay from a revoked waiter and preserves its effect audit", async () => {
        const f = httpGridFixture(), args = await updateArgs(f), gate = pauseValidation(f);
        const first = f.call("update_grid_query", args, undefined, "first");
        await gate.started.promise;
        const entered = deferred();
        // Observe entry into the actual cache, after authorization, rather
        // than guessing that the request has joined from event-loop timing.
        const cache = (f.relations as unknown as { idempotency: IdempotencyCache; }).idempotency;
        const original = cache.run.bind(cache);
        cache.run = <T>(key: string | undefined, run: () => Promise<T> | T) => {
            const result = original<T>(key, run);
            entered.resolve();
            return result;
        };
        const waiting = f.call("update_grid_query", args, undefined, "waiter");
        await entered.promise;
        f.access.denied.add("waiter");
        gate.release.resolve();
        const [accepted, denied] = await Promise.all([first, waiting]);
        expect(accepted.payload).to.include({ applied: true, replayed: false });
        expect(denied.payload.code).to.equal("forbidden");
        withheld(denied);
        const before = snapshot(f);
        f.access.denied.clear();
        expect((await f.call("update_grid_query", args)).payload).to.deep.equal({
            ...accepted.payload,
            replayed: true,
        });
        expect(snapshot(f)).to.deep.equal(before);
        expect((await audits(args.operationId)).find(record => record.outcome === "forbidden"))
            .to.include({ applied: true, replayed: true, entity: `grid:${args.gridId}` });
    });
    for (const room of ["source", "project"] as const) {
        for (const mode of ["deny", "lookup", "reject"] as const) {
            it(`retains the accepted update across ${room} cleanup (${mode})`, async () => {
                const f = httpGridFixture(), args = await updateArgs(f), gate = holdCleanup(f, room, mode === "reject");
                const pending = f.call("update_grid_query", args);
                await gate.started.promise;
                expect(f.project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(args.gridId)!.get("query")).to.equal(
                    args.query,
                );
                const afterPublication = snapshot(f);
                if (mode === "deny") f.access.allowed = false;
                if (mode === "lookup") {
                    f.access.checked = () => {
                        throw new Error("private ACL failure");
                    };
                }
                gate.release.resolve();
                const result = await pending;
                if (mode === "reject") expect(result.payload).to.include({ applied: true, replayed: false });
                else {
                    expect(result.payload.code).to.equal("forbidden");
                    withheld(result);
                    expect((await audits(args.operationId)).at(-1)).to.include({
                        outcome: "forbidden",
                        applied: true,
                        replayed: false,
                    });
                }
                f.access.allowed = true;
                f.access.checked = () => {};
                const replay = await f.call("update_grid_query", args);
                expect(replay.payload).to.include({ applied: true, replayed: true });
                expect(replay.payload.after.query).to.equal(args.query);
                expect(snapshot(f)).to.deep.equal(afterPublication);
            });
        }
    }
    for (const dryRun of [true, false]) {
        it(`does not accept a pre-effect cleanup failure (dryRun=${dryRun})`, async () => {
            const f = httpGridFixture(), args = await updateArgs(f), before = snapshot(f);
            const gate = holdCleanup(f, "source", true);
            const input = { ...args, dryRun, query: dryRun ? args.query : "SELECT missing FROM tasks" };
            const pending = f.call("update_grid_query", input);
            await gate.started.promise;
            gate.release.resolve();
            const failed = await pending;
            expect(failed.isError).to.equal(true);
            expect(snapshot(f)).to.deep.equal(before);
            expect((await audits(args.operationId)).at(-1)).to.include({ applied: false, replayed: false });
            // A failed operation did not consume this operation ID.
            const retry = await f.call("update_grid_query", args);
            expect(retry.payload).to.include({ applied: true, replayed: false });
        });
    }
});
