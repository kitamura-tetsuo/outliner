import { expect } from "chai";
import fs from "fs-extra";
import { createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import {
    AclStore,
    restartFromStorage,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
} from "./server-create-table-fixture.js";

describe("SQL catalog persistence acknowledgement race (#5532 REQ-007)", function() {
    this.timeout(120000);
    const projectId = "catalog-storage-race";
    const uid = "catalog-owner";
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let server: TestServer;
    let acl: AclStore;

    beforeEach(async () => {
        const dir = tempDir();
        dirs.push(dir);
        acl = new AclStore();
        acl.grant("projectUsers", projectId, uid);
        server = await startTestServer(dir, acl);
        servers.push(server);
        await seedProject(server.hocuspocus, projectId);
    });

    afterEach(async () => {
        for (const running of servers.splice(0)) await stopTestServer(running);
        for (const dir of dirs.splice(0)) await fs.remove(dir);
    });

    it("does not confirm an accepted revision when persistence stores a newer peer source", async () => {
        const store = createDocumentStore(server.persistence!);
        const ordinary = new SqlCatalogMutationService(server.hocuspocus, acl.checkAccess, store);
        const initial = await ordinary.read(uid, projectId);
        const original = { id: "enum-mood", kind: "enum" as const, source: "CREATE TYPE mood AS ENUM ('ok')" };
        expect(
            (await ordinary.apply(uid, projectId, {
                expectedRevision: initial.revision,
                intent: { operation: "create", object: original },
            })).status,
        ).to.equal("applied");

        let release!: () => void;
        let reached!: () => void;
        const boundary = new Promise<void>(resolve => reached = resolve);
        const barrier = new Promise<void>(resolve => release = resolve);
        const first = new SqlCatalogMutationService(server.hocuspocus, acl.checkAccess, store, {
            afterMutationBeforeStore: async () => {
                reached();
                await barrier;
            },
        });
        const before = await ordinary.read(uid, projectId);
        const accepted = { ...original, source: "CREATE TYPE mood AS ENUM ('ok', 'first')" };
        const applying = first.apply(uid, projectId, {
            expectedRevision: before.revision,
            intent: { operation: "replace", object: accepted },
        });
        await boundary;
        const observed = await ordinary.read(uid, projectId);
        expect(observed.objects[0]?.source).to.equal(accepted.source);
        const newer = { ...original, source: "CREATE TYPE mood AS ENUM ('ok', 'first', 'peer')" };
        expect(
            (await ordinary.apply(uid, projectId, {
                expectedRevision: observed.revision,
                intent: { operation: "replace", object: newer },
            })).status,
        ).to.equal("applied");
        release();
        const outcome = await applying;
        expect(outcome).to.include({ status: "unconfirmed", applied: false });
        expect((await ordinary.read(uid, projectId)).objects[0]?.source).to.equal(newer.source);

        const restarted = await restartFromStorage(dirs[0], acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        const cold = new SqlCatalogMutationService(
            restarted.server.hocuspocus,
            acl.checkAccess,
            createDocumentStore(restarted.server.persistence!),
        );
        expect((await cold.read(uid, projectId)).objects[0]?.source).to.equal(newer.source);
    });
});
