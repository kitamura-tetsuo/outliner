import { expect } from "chai";
import fs from "node:fs";
import { mcpLogger, mcpLogPath } from "../src/utils/log-manager.js";
import { childKeys, gridIds, gridPlacements } from "./mcp-create-grid-fixture.js";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";

describe("create_grid audit and publication failure (#5350)", function() {
    this.timeout(30000);

    it("audits scope, schema and project authorization rejections", async () => {
        const f = httpGridFixture();
        const operationId = `rejected-${crypto.randomUUID()}`;
        const invalid = { ...f.args, operationId, query: 42 };
        expect((await f.call("create_grid", invalid, f.app("outliner.read"))).payload.code).to.equal("forbidden");
        expect((await f.call("create_grid", invalid)).payload.code).to.equal("invalid_argument");
        f.access.allowed = false;
        expect((await f.call("create_grid", { ...f.args, operationId })).payload.code).to.equal("forbidden");
        await new Promise<void>((resolve, reject) => mcpLogger.flush(error => error ? reject(error) : resolve()));
        const records = fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))
            .filter(record => record.event === "mcp_audit" && record.operationId === operationId);
        expect(records.map(record => record.outcome)).to.deep.equal(["forbidden", "invalid_argument", "forbidden"]);
        for (const record of records) {
            expect(record).to.include({
                tool: "create_grid",
                projectId: "project-1",
                dryRun: false,
                applied: false,
                replayed: false,
            });
        }
        expect(gridPlacements(f.project)).to.deep.equal([]);
    });

    it("audits preview, apply, replay and rolled-back publication without private payloads", async () => {
        const f = httpGridFixture();
        const operationId = `audit-${crypto.randomUUID()}`;
        const args = { ...f.args, operationId, name: "Private Grid name" };
        const preview = (await f.call("create_grid", { ...args, dryRun: true })).payload;
        const saved = (await f.call("create_grid", args)).payload;
        expect(saved).to.include({ applied: true, replayed: false });
        expect((await f.call("create_grid", args)).payload).to.deep.equal({ ...saved, replayed: true });
        const before = {
            grids: gridIds(f.project),
            placements: gridPlacements(f.project),
            children: childKeys(f.page),
        };
        let thrown = false;
        // Real publication observer fails after Yjs wrote both halves.
        f.project.ydoc.getMap("orderedTree").observeDeep(() => {
            if (thrown) return;
            thrown = true;
            throw new Error("private internal publication exception");
        });
        const failedId = `${operationId}-failed`;
        const failed = await f.call("create_grid", { ...args, operationId: failedId });
        expect(failed.payload.code).to.equal("internal_failure");
        expect(JSON.stringify(failed)).not.to.contain("private internal publication exception");
        expect(thrown).to.equal(true);
        expect({ grids: gridIds(f.project), placements: gridPlacements(f.project), children: childKeys(f.page) }).to
            .deep.equal(before);
        const subtree = (await f.call("get_subtree", { projectId: args.projectId, itemId: args.pageId })).payload;
        expect(subtree.root.children.map((child: { id: string; }) => child.id)).to.deep.equal(before.children);

        await new Promise<void>((resolve, reject) => mcpLogger.flush(error => error ? reject(error) : resolve()));
        const records = fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))
            .filter(record => record.event === "mcp_audit" && [operationId, failedId].includes(record.operationId));
        expect(records).to.have.length(4);
        expect(records.map(({ dryRun, outcome, applied, replayed }) => ({ dryRun, outcome, applied, replayed }))).to
            .deep.equal([
                { dryRun: true, outcome: "success", applied: false, replayed: false },
                { dryRun: false, outcome: "success", applied: true, replayed: false },
                { dryRun: false, outcome: "success", applied: true, replayed: true },
                { dryRun: false, outcome: "internal_failure", applied: false, replayed: false },
            ]);
        expect(records[0].newRevision).to.equal(preview.revision);
        for (const record of records.slice(1, 3)) {
            expect(record).to.include({ entity: `grid:${saved.gridId}`, newRevision: saved.revision });
        }
        for (const record of records) expect(record).to.include({ tool: "create_grid", projectId: "project-1" });
        for (const secret of [args.query, "Write spec", "private-grid-token", "private-grid-user", args.name]) {
            expect(JSON.stringify(records)).not.to.contain(secret);
        }
        // Publication failure does not consume its operation ID.
        expect((await f.call("create_grid", { ...args, operationId: failedId })).payload)
            .to.include({ applied: true, replayed: false });
    });
});
