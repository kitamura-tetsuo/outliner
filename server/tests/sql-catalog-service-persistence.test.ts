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

describe("SQL catalog persistence and publication races (#5532 REQ-009)", function() {
    this.timeout(120000);
    const projectId = "catalog-persistence-project";
    const uid = "catalog-owner";
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let acl: AclStore;
    let server: TestServer;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", projectId, uid);
        const dir = tempDir();
        dirs.push(dir);
        server = await startTestServer(dir, acl);
        servers.push(server);
        await seedProject(server.hocuspocus, projectId);
    });

    afterEach(async () => {
        for (const running of servers.splice(0)) await stopTestServer(running);
        for (const dir of dirs.splice(0)) await fs.remove(dir);
    });

    const serviceFor = (target: TestServer, beforePublication?: () => Promise<void>) =>
        new SqlCatalogMutationService(
            target.hocuspocus,
            acl.checkAccess,
            createDocumentStore(target.persistence!),
            { beforePublication },
        );

    it("reads the exact stable source and revision after an abrupt reconstruction from acknowledged storage", async () => {
        const service = serviceFor(server);
        const initial = await service.read(uid, projectId);
        const object = {
            id: "enum-cold-read",
            kind: "enum" as const,
            source: "CREATE TYPE cold_state AS ENUM ('new', 'ready')",
        };
        const applied = await service.apply(uid, projectId, {
            expectedRevision: initial.revision,
            intent: { operation: "create", object },
        });
        expect(applied.status).to.equal("applied");
        if (applied.status !== "applied") throw new Error("Expected confirmed apply");

        const restarted = await restartFromStorage(dirs[0], acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        const cold = await serviceFor(restarted.server).read(uid, projectId);
        expect(cold.objects).to.deep.equal([object]);
        expect(cold.revision).to.equal(applied.after.revision);
    });

    it("allows only one of two requests validated against one observed revision to publish", async () => {
        const ordinary = serviceFor(server);
        const initial = await ordinary.read(uid, projectId);
        let release!: () => void;
        let reached!: () => void;
        const atBoundary = new Promise<void>(resolve => reached = resolve);
        const barrier = new Promise<void>(resolve => release = resolve);
        const delayed = serviceFor(server, async () => {
            reached();
            await barrier;
        });
        const first = delayed.apply(uid, projectId, {
            expectedRevision: initial.revision,
            intent: {
                operation: "create",
                object: { id: "enum-first", kind: "enum", source: "CREATE TYPE first_state AS ENUM ('a')" },
            },
        });
        await atBoundary;
        const competing = await ordinary.apply(uid, projectId, {
            expectedRevision: initial.revision,
            intent: {
                operation: "create",
                object: { id: "enum-second", kind: "enum", source: "CREATE TYPE second_state AS ENUM ('b')" },
            },
        });
        expect(competing.status).to.equal("applied");
        expect((await ordinary.read(uid, projectId)).objects.map(object => object.id)).to.deep.equal(["enum-second"]);
        release();
        const refused = await first;
        expect(refused).to.include({ status: "refused", reason: "stale", applied: false });
        expect((await ordinary.read(uid, projectId)).objects.map(object => object.id)).to.deep.equal(["enum-second"]);
    });
});
