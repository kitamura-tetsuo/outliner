import { expect } from "chai";
import { describe, it } from "mocha";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";
import { auditReader, holdCleanup, pauseValidation, snapshot } from "./mcp-grid-repair-fixture.js";

function withheld(result: unknown) {
    const text = JSON.stringify(result);
    for (
        const secret of [
            "table-tasks",
            "table-people",
            "tasks",
            "Write spec",
            "sourceDiagnostics",
            "validation",
            "sampleRows",
        ]
    ) {
        expect(text).not.to.contain(secret);
    }
}
describe("Grid final diagnostic disclosure authorization", function() {
    this.timeout(30000);
    const audits = auditReader();
    for (const dryRun of [false, true]) {
        for (const failure of ["deny", "lookup"] as const) {
            it(`withholds rejected preference after real validation (${dryRun}, ${failure})`, async () => {
                const f = httpGridFixture(), before = snapshot(f), gate = pauseValidation(f);
                const args = {
                    ...f.args,
                    insertTargetTableId: "table-people",
                    dryRun,
                    operationId: crypto.randomUUID(),
                };
                const pending = f.call("create_grid", args);
                await gate.started.promise;
                if (failure === "deny") f.access.allowed = false;
                else {f.access.checked = () => {
                        throw new Error("private ACL lookup");
                    };}
                gate.release.resolve();
                const result = await pending;
                expect(result.payload.code).to.equal("forbidden");
                withheld(result);
                expect(snapshot(f)).to.deep.equal(before);
                expect((await audits(args.operationId)).at(-1)).to.include({
                    outcome: "forbidden",
                    applied: false,
                    replayed: false,
                });
            });
        }
    }
    it("preserves authorized preference diagnostics and sanitizes a different SQL failure", async () => {
        const f = httpGridFixture(), before = snapshot(f);
        const control = await f.call("create_grid", { ...f.args, insertTargetTableId: "table-people" });
        expect(control.payload.code).to.equal("invalid_argument");
        expect(JSON.stringify(control)).to.contain("sourceDiagnostics");
        const gate = pauseValidation(f);
        const operationId = crypto.randomUUID();
        const pending = f.call("create_grid", { ...f.args, query: "SELECT private_missing FROM tasks", operationId });
        await gate.started.promise;
        f.access.allowed = false;
        gate.release.resolve();
        const denied = await pending;
        expect(denied.payload.code).to.equal("forbidden");
        withheld(denied);
        expect(JSON.stringify(denied)).not.to.contain("private_missing");
        expect(snapshot(f)).to.deep.equal(before);
        expect((await audits(operationId)).at(-1)).to.include({ outcome: "forbidden", applied: false });
    });
    for (const room of ["source", "project"] as const) {
        it(`retains an accepted create when access is lost during ${room} cleanup`, async () => {
            const f = httpGridFixture();
            const gate = holdCleanup(f, room, true);
            const operationId = crypto.randomUUID();
            const pending = f.call("create_grid", { ...f.args, operationId });
            await gate.started.promise;
            const acceptedState = snapshot(f);
            f.access.allowed = false;
            gate.release.resolve();
            const denied = await pending;
            expect(denied.payload.code).to.equal("forbidden");
            withheld(denied);
            expect(snapshot(f)).to.deep.equal(acceptedState);
            expect((await audits(operationId)).at(-1)).to.include({
                outcome: "forbidden",
                applied: true,
                replayed: false,
            });
            f.access.allowed = true;
            const replay = (await f.call("create_grid", { ...f.args, operationId })).payload;
            expect(replay).to.include({ applied: true, replayed: true });
            expect(snapshot(f)).to.deep.equal(acceptedState);
            expect((await audits(operationId)).at(-1)).to.include({ entity: `grid:${replay.gridId}` });
        });
    }
    for (const boundary of ["validation", "source", "project"] as const) {
        for (const lookup of [false, true]) {
            it(`withholds validation samples after ${boundary}, lookup failure=${lookup}`, async () => {
                const f = httpGridFixture(), before = snapshot(f);
                const args = { projectId: "project-1", gridId: "grid-existing", query: f.args.query };
                const control = await f.call("validate_grid_query", args);
                expect(control.payload.sampleRows).to.deep.equal([{ id: "t1", title: "Write spec" }, {
                    id: "t2",
                    title: "Ship",
                }]);
                expect(control.payload.resultColumns.map((column: { name: string; }) => column.name)).to.deep.equal([
                    "id",
                    "title",
                ]);
                const gate = boundary === "validation" ? pauseValidation(f) : holdCleanup(f, boundary);
                const pending = f.call("validate_grid_query", args);
                await gate.started.promise;
                if (lookup) {
                    f.access.checked = () => {
                        throw new Error("private ACL");
                    };
                } else f.access.allowed = false;
                gate.release.resolve();
                const result = await pending;
                expect(result.payload.code).to.equal("forbidden");
                withheld(result);
                expect(snapshot(f)).to.deep.equal(before);
            });
        }
    }
});
