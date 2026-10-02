import { expect } from "chai";
import { token } from "./mcp-create-table-fixture.js";
import { type GridMcpFixture, startGridMcpFixture, UID, updateArgs } from "./mcp-grid-presentation-mcp-fixture.js";
import { PROJECT } from "./server-grid-presentation-fixture.js";

// Issue #5436 REQ-004/005/007/008: scopes, structured errors, revocation
// disclosure, uncertain effects and fail-closed delivery.
describe("MCP update_grid_presentation errors (#5436)", function() {
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
    const reader = (bearer: string) => (name: string, args: object, options?: { requestId?: string; }) =>
        t.mcp.call(name, args, { ...options, bearer });

    it("enforces the write scope before argument-shape validation", async () => {
        const readOnly = token(UID, "outliner.read");
        const call = reader(readOnly);
        const denied = await call("update_grid_presentation", updateArgs({ expectedPresentationRevision: "x" }));
        expect(denied.result.isError).to.equal(true);
        expect(denied.payload.code).to.equal("forbidden");
        expect(denied.result._meta["mcp/www_authenticate"]).to.contain("insufficient_scope");
        // A malformed call from a read-only caller is still a scope refusal,
        // never an argument-shape error.
        const malformed = await call("update_grid_presentation", { projectId: PROJECT });
        expect(malformed.result.isError).to.equal(true);
        expect(malformed.payload.code).to.equal("forbidden");
        // The same malformed call with the write scope is an argument error.
        const shaped = await t.mcp.call("update_grid_presentation", { projectId: PROJECT });
        expect(shaped.result.isError).to.equal(true);
        expect(shaped.payload.code).to.equal("invalid_argument");
        expect(shaped.payload.requestId).to.be.a("string");
    });

    it("maps shape, bound and state conflicts to machine-readable codes", async () => {
        const current = await revision();
        const cases: [Record<string, unknown>, string][] = [
            [{ changes: { query: "SELECT 1" } }, "invalid_argument"],
            [{ changes: { sourceTableId: "table-tasks" } }, "invalid_argument"],
            [{ changes: { components: { title: { hidden: true } } } }, "invalid_argument"],
            [{ changes: { components: { title: {} } } }, "invalid_argument"],
            [{ changes: { columnOrder: ["title", "title"] } }, "invalid_argument"],
            [{ changes: {} }, "invalid_argument"],
            [{ projectId: "../other" }, "invalid_argument"],
            [{ operationId: " " }, "invalid_argument"],
            [{ changes: { name: "x".repeat(2000) } }, "size_limit"],
            [{ changes: { columnOrder: ["x".repeat(300)] } }, "size_limit"],
            [{ gridId: "grid-missing", expectedPresentationRevision: current }, "not_found"],
            [{ expectedPresentationRevision: "grid-presentation-v1:stale" }, "stale_revision"],
        ];
        for (const [override, code] of cases) {
            for (const dryRun of [true, false]) {
                const result = await t.mcp.call(
                    "update_grid_presentation",
                    updateArgs({ expectedPresentationRevision: current, ...override, dryRun }),
                );
                expect(result.result.isError, JSON.stringify(override)).to.equal(true);
                expect(result.payload.code, JSON.stringify(override)).to.equal(code);
                expect(result.payload.requestId).to.be.a("string");
            }
        }
        // An authorized stale conflict names the current revision.
        const stale = await t.mcp.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: "grid-presentation-v1:stale",
            }),
        );
        expect(stale.payload.currentPresentationRevision).to.equal(current);
    });

    it("withholds results after revocation without losing the authorized effect", async () => {
        const args = updateArgs({ expectedPresentationRevision: await revision(), operationId: "revoked-op" });
        expect((await t.mcp.call("update_grid_presentation", args)).payload).to.include({ applied: true });
        t.acl.revokeAll(PROJECT);
        const denied = await t.mcp.call("update_grid_presentation", args);
        expect(denied.result.isError).to.equal(true);
        expect(denied.payload.code).to.equal("forbidden");
        expect(JSON.stringify(denied.payload)).not.to.contain("grid-presentation-v1");
        expect(denied.payload).not.to.have.property("currentPresentationRevision");
        // The authorized effect stays; re-granting replays the original outcome.
        const labels = await t.mcp.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" }, {
            bearer: token(UID, "outliner.read outliner.write"),
        });
        expect(labels.result.isError).to.equal(true);
        t.acl.grant("projectUsers", PROJECT, UID);
        const replay = (await t.mcp.call("update_grid_presentation", args)).payload;
        expect(replay).to.include({ applied: true, replayed: true });
        const grid = (await t.mcp.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        expect(grid.presentation.components.title.label).to.equal("件名");
    });

    it("reports an uncertain effect as applied-null and replays it without rewriting", async () => {
        t.seams.afterStore = async () => {
            throw new Error("storage acknowledgement lost");
        };
        const args = updateArgs({ expectedPresentationRevision: await revision(), operationId: "uncertain-op" });
        const first = await t.mcp.call("update_grid_presentation", args);
        expect(first.result.isError).to.equal(true);
        expect(first.payload.code).to.equal("internal_failure");
        expect(first.payload.applied).to.equal(null);
        expect(first.payload.replayed).to.equal(false);
        expect(first.payload.requestId).to.be.a("string");
        expect(first.payload).not.to.have.property("presentationRevision");
        expect(t.domainCalls).to.equal(1);

        // The same-identity retry replays the uncertain outcome: no second
        // domain attempt, so the writer runs exactly once.
        const retry = await t.mcp.call("update_grid_presentation", args);
        expect(retry.result.isError).to.equal(true);
        expect(retry.payload.code).to.equal("internal_failure");
        expect(retry.payload.applied).to.equal(null);
        expect(retry.payload.replayed).to.equal(true);
        expect(t.domainCalls).to.equal(1);

        // The effect itself is kept, never rolled back.
        t.seams.afterStore = undefined;
        const grid = (await t.mcp.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        expect(grid.presentation.components.title.label).to.equal("件名");
    });

    it("fails closed when an established outcome cannot be delivered", async () => {
        t.seams.deliver = outcome => ({ ...outcome, presentationRevision: undefined }) as never;
        const args = updateArgs({ expectedPresentationRevision: await revision(), operationId: "undeliverable" });
        const first = await t.mcp.call("update_grid_presentation", args);
        expect(first.result.isError).to.equal(true);
        expect(first.payload.code).to.equal("internal_failure");
        const retry = await t.mcp.call("update_grid_presentation", args);
        expect(retry.result.isError).to.equal(true);
        expect(retry.payload.code).to.equal("internal_failure");
        expect(retry.payload.replayed).to.equal(true);
        expect(t.domainCalls, "a retained outcome must never re-execute").to.equal(1);
    });
});
