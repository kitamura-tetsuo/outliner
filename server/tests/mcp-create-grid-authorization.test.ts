import { expect } from "chai";
import { afterFirstValidation, gridIds, gridPlacements } from "./mcp-create-grid-fixture.js";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

// Pause real executable validation to force a retry to join an in-flight apply.
function pauseValidation(f: ReturnType<typeof httpGridFixture>) {
    const started = deferred();
    const release = deferred();
    const target = f.relations as unknown as { queryPlanDependencies: (...args: unknown[]) => Promise<string[]>; };
    const original = target.queryPlanDependencies.bind(f.relations);
    let calls = 0;
    target.queryPlanDependencies = async (...args) => {
        const result = await original(...args);
        calls++;
        started.resolve();
        await release.promise;
        return result;
    };
    return { started, release, count: () => calls };
}

describe("create_grid authorization and replay boundaries (#5350)", function() {
    this.timeout(30000);

    it("enforces write scope before argument validation and project access before creation", async () => {
        const f = httpGridFixture();
        for (const args of [f.args, { query: 42 }]) {
            const result = await f.call("create_grid", args, f.app("outliner.read"));
            expect(result.payload.code).to.equal("forbidden");
            expect(result._meta["mcp/www_authenticate"]).to.contain("insufficient_scope");
        }
        f.access.allowed = false;
        expect((await f.call("create_grid", f.args)).payload.code).to.equal("forbidden");
        f.access.allowed = true;
        expect((await f.call("create_grid", f.args)).payload).to.include({ applied: true, replayed: false });
        expect(gridPlacements(f.project)).to.have.length(1);
    });

    it("rechecks authorization after validation in both preview and apply", async () => {
        for (const dryRun of [true, false]) {
            const f = httpGridFixture();
            afterFirstValidation(f.relations, () => {
                f.access.allowed = false;
            });
            const denied = await f.call("create_grid", { ...f.args, dryRun });
            expect(denied.payload.code).to.equal("forbidden");
            expect(denied.payload).not.to.have.property("gridId");
            expect(gridIds(f.project)).to.deep.equal(["grid-existing"]);
            expect(gridPlacements(f.project)).to.deep.equal([]);
            f.access.allowed = true;
            expect((await f.call("create_grid", f.args)).payload).to.include({ applied: true, replayed: false });
        }
    });

    it("denies completed retries without changing the original replay state", async () => {
        const f = httpGridFixture();
        const original = (await f.call("create_grid", f.args)).payload;
        f.access.allowed = false;
        const denied = (await f.call("create_grid", f.args)).payload;
        expect(denied.code).to.equal("forbidden");
        expect(JSON.stringify(denied)).not.to.contain(original.gridId).and.not.to.contain(original.placementId);
        f.access.allowed = true;
        expect((await f.call("create_grid", f.args)).payload).to.deep.equal({ ...original, replayed: true });
    });

    for (const revokeWaiter of [false, true]) {
        it(`joins concurrent apply once and rechecks waiting caller access (revoke=${revokeWaiter})`, async () => {
            const f = httpGridFixture();
            const gate = pauseValidation(f);
            const first = f.call("create_grid", f.args, undefined, "first");
            await gate.started.promise;
            // An unauthorized attempt while the original is pending must leave it alone.
            f.access.denied.add("denied");
            expect((await f.call("create_grid", f.args, undefined, "denied")).payload.code).to.equal("forbidden");
            const joined = deferred();
            f.access.checked = id => {
                if (id === "waiting") joined.resolve();
            };
            const second = f.call("create_grid", f.args, undefined, "waiting");
            await joined.promise;
            // Let the authorized request enter the existing replay promise.
            await new Promise<void>(resolve => setImmediate(resolve));
            if (revokeWaiter) f.access.denied.add("waiting");
            gate.release.resolve();
            const [a, b] = await Promise.all([first, second]);
            expect(a.payload).to.include({ applied: true, replayed: false });
            if (revokeWaiter) {
                expect(b.payload.code).to.equal("forbidden");
                expect(JSON.stringify(b.payload)).not.to.contain(a.payload.gridId).and.not.to.contain(
                    a.payload.placementId,
                );
            } else expect(b.payload).to.deep.equal({ ...a.payload, replayed: true });
            expect(gate.count()).to.equal(1);
            expect(gridIds(f.project)).to.have.length(2);
            expect(gridPlacements(f.project)).to.deep.equal([`${a.payload.placementId}:${a.payload.gridId}`]);
            expect((await f.call("get_item", { projectId: f.args.projectId, itemId: a.payload.placementId })).payload)
                .to.include({ kind: "grid", gridId: a.payload.gridId, parentId: f.page.id });
            f.access.denied.clear();
            expect((await f.call("create_grid", f.args)).payload).to.deep.equal({ ...a.payload, replayed: true });
        });
    }
});
