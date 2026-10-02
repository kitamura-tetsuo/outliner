import { expect } from "chai";
import fs from "fs-extra";
import type { OutlinerGridPresentationService } from "../src/mcp/grid-presentation.js";
import {
    AclStore,
    rejection,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
} from "./server-create-table-fixture.js";
import { PROJECT, recordUpdates, seedGridProject } from "./server-grid-presentation-fixture.js";

const UID = "user-1";

// Issue #5435 REQ-002 / AS-006: the complete request is validated before any
// effect. A valid label mixed with any invalid part changes nothing, and
// limits are enforced exactly at their byte/count boundaries.
describe("Grid presentation update: atomic request validation (#5435 REQ-002, AS-006)", function() {
    this.timeout(60000);
    let acl: AclStore;
    let server: TestServer;
    let dir: string;
    let service: OutlinerGridPresentationService;
    let revision: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        service = server.gridPresentation;
        await seedGridProject(server.hocuspocus);
        revision = (await service.readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision;
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const request = (changes: unknown, extra: Record<string, unknown> = {}) => ({
        projectId: PROJECT,
        gridId: "grid-tasks",
        expectedPresentationRevision: revision,
        changes,
        ...extra,
    });
    const update = (body: unknown) => service.updatePresentation(UID, body as never);
    const label = { title: { label: "件名" } };

    /** The request is refused with `code` and the live room emits no update at all. */
    const refusedWithoutEffect = async (body: unknown, code = "invalid_argument") => {
        const recorder = await recordUpdates(server.hocuspocus);
        try {
            const error = await rejection(update(body));
            expect(error.code, JSON.stringify(body).slice(0, 200)).to.equal(code);
            expect(error.debug).to.include({ effect: "none" });
            expect(recorder.updates).to.have.length(0);
        } finally {
            await recorder.stop();
        }
        const after = await service.readPresentation(UID, PROJECT, "grid-tasks");
        expect(after.presentationRevision).to.equal(revision);
        expect(after.presentation.components).to.deep.equal({});
    };

    it("rejects a valid label mixed with any invalid change", async () => {
        const invalidMixes: unknown[] = [
            { components: { ...label, done: { type: "currency" } } },
            { components: { ...label, done: { hidden: true } } },
            { components: { ...label, done: { shown: "no" } } },
            { components: { ...label, done: { label: 5 } } },
            { components: { ...label, done: { width: 100 } } },
            { components: { ...label, done: {} } },
            { components: { ...label, done: null } },
            { components: { ...label, "": { label: "blank key" } } },
            { components: { ...label, " ": { label: "blank key" } } },
            { components: label, columnOrder: ["title", "title"] },
            { components: label, columnOrder: ["title", " "] },
            { components: label, columnOrder: ["title", 3] },
            { components: label, columnOrder: "title" },
            { components: label, name: 42 },
            { components: label, showAddRowButton: "yes" },
            { components: label, confirmRowDelete: 1 },
            { components: label, hidden: { title: true } },
            { components: label, query: "SELECT 1" },
            { components: label, sourceTableId: "table-other" },
            { components: {} },
            {},
            [],
            null,
        ];
        for (const changes of invalidMixes) await refusedWithoutEffect(request(changes));
    });

    it("rejects malformed identifiers, tokens and unknown request fields", async () => {
        await refusedWithoutEffect(request(label, { projectId: "bad/id" }));
        await refusedWithoutEffect(request(label, { projectId: "p".repeat(129) }));
        await refusedWithoutEffect(request(label, { gridId: "grid tasks" }));
        await refusedWithoutEffect(request(label, { expectedPresentationRevision: "  " }));
        await refusedWithoutEffect(request(label, { expectedPresentationRevision: "r".repeat(201) }));
        await refusedWithoutEffect(request(label, { expectedPresentationRevision: 7 }));
        await refusedWithoutEffect(request(label, { dryRun: "true" }));
        await refusedWithoutEffect(request(label, { operationId: "op-1" }));
        await refusedWithoutEffect(request(label, { expectedRevision: revision }));
    });

    it("enforces byte and count limits exactly at their boundaries", async () => {
        // 3-byte characters: 341 * 3 = 1023 (+1 ASCII = 1024) is at the limit; 1025 is beyond.
        const atLabel = `${"期".repeat(341)}a`;
        const overLabel = `${"期".repeat(341)}ab`;
        await refusedWithoutEffect(request({ components: { ...label, done: { label: overLabel } } }), "size_limit");
        await refusedWithoutEffect(request({ ...{ components: label }, name: overLabel }), "size_limit");
        // Column keys: 256 bytes at the limit, 257 beyond (in keys and in the order alike).
        const atKey = `${"列".repeat(85)}a`; // 255 + 1
        const overKey = `${"列".repeat(85)}ab`;
        await refusedWithoutEffect(request({ components: { ...label, [overKey]: { shown: false } } }), "size_limit");
        await refusedWithoutEffect(request({ components: label, columnOrder: [overKey] }), "size_limit");
        // Counts: 100 at the limit, 101 beyond.
        const names = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
        await refusedWithoutEffect(request({ components: label, columnOrder: names(101) }));
        await refusedWithoutEffect(
            request({ components: Object.fromEntries(names(101).map(name => [name, { shown: false }])) }),
        );
        // Serialized changes: beyond 65,536 bytes even though each field is in range.
        const big = Object.fromEntries(names(100).map(name => [name, { label: "期".repeat(300) }]));
        expect(Buffer.byteLength(JSON.stringify({ components: big }), "utf8")).to.be.greaterThan(65536);
        await refusedWithoutEffect(request({ components: big }), "size_limit");

        // Everything exactly at its limit is accepted.
        const accepted = await update(request({
            name: atLabel,
            columnOrder: [atKey, ...names(99)],
            components: {
                [atKey]: { label: atLabel },
                ...Object.fromEntries(names(99).map(n => [n, { shown: false }])),
            },
        }));
        expect(accepted).to.include({ dryRun: false, applied: true });
        const read = await service.readPresentation(UID, PROJECT, "grid-tasks");
        expect(read.presentation.name).to.equal(atLabel);
        expect(read.presentation.components[atKey].label).to.equal(atLabel);
        expect(read.presentation.columnOrder).to.have.length(100);
    });

    it("rejects a read of a malformed identifier before touching any room", async () => {
        expect((await rejection(service.readPresentation(UID, "bad id", "grid-tasks"))).code).to.equal(
            "invalid_argument",
        );
        expect((await rejection(service.readPresentation(UID, PROJECT, "x".repeat(129)))).code).to.equal(
            "invalid_argument",
        );
    });
});
