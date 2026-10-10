import { expect } from "chai";
import fs from "fs-extra";
import { createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import {
    AclStore,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

describe("SQL catalog mutation service (#5532)", function() {
    this.timeout(90000);
    const projectId = "catalog-service-project";
    const uid = "catalog-owner";
    let dir: string;
    let server: TestServer;
    let acl: AclStore;
    let service: SqlCatalogMutationService;

    beforeEach(async () => {
        dir = tempDir();
        acl = new AclStore();
        acl.grant("projectUsers", projectId, uid);
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, projectId);
        service = new SqlCatalogMutationService(
            server.hocuspocus,
            acl.checkAccess,
            createDocumentStore(server.persistence!),
        );
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    it("previews without effect, applies exact source, and rejects stale or occupied IDs", async () => {
        const initial = await service.read(uid, projectId);
        const request = {
            expectedRevision: initial.revision,
            intent: {
                operation: "create" as const,
                object: {
                    id: "enum-priority",
                    kind: "enum" as const,
                    source: "CREATE TYPE priority AS ENUM ('low', 'high')",
                },
            },
        };
        const preview = await service.validate(uid, projectId, request);
        expect(preview.status).to.equal("preview");
        expect((await service.read(uid, projectId)).objects).to.deep.equal([]);

        const applied = await service.apply(uid, projectId, request);
        expect(applied.status).to.equal("applied");
        const read = await service.read(uid, projectId);
        expect(read.objects).to.deep.equal([request.intent.object]);

        const stale = await service.apply(uid, projectId, request);
        expect(stale).to.include({ status: "refused", reason: "stale", applied: false });
        const occupied = await service.apply(uid, projectId, { ...request, expectedRevision: read.revision });
        expect(occupied).to.include({ status: "refused", reason: "occupied-id", applied: false });
    });

    it("rechecks resource-side authorization after candidate execution", async () => {
        const initial = await service.read(uid, projectId);
        let release!: () => void;
        let reached!: () => void;
        const reachedBarrier = new Promise<void>(resolve => reached = resolve);
        const barrier = new Promise<void>(resolve => release = resolve);
        service = new SqlCatalogMutationService(
            server.hocuspocus,
            acl.checkAccess,
            createDocumentStore(server.persistence!),
            {
                beforePublication: async () => {
                    reached();
                    await barrier;
                },
            },
        );
        const applying = service.apply(uid, projectId, {
            expectedRevision: initial.revision,
            intent: {
                operation: "create",
                object: { id: "enum-revoked", kind: "enum", source: "CREATE TYPE mood AS ENUM ('ok')" },
            },
        });
        await reachedBarrier;
        acl.revokeAll(projectId);
        release();
        let code: string | undefined;
        try {
            await applying;
        } catch (error) {
            code = (error as { code?: string; }).code;
        }
        expect(code).to.equal("forbidden");
        acl.grant("projectUsers", projectId, uid);
        expect((await service.read(uid, projectId)).objects).to.deep.equal([]);
    });

    it("refuses removal while a real Table schema references the ENUM", async () => {
        let snapshot = await service.read(uid, projectId);
        const created = await service.apply(uid, projectId, {
            expectedRevision: snapshot.revision,
            intent: {
                operation: "create",
                object: { id: "enum-state", kind: "enum", source: "CREATE TYPE state AS ENUM ('open', 'done')" },
            },
        });
        expect(created.status).to.equal("applied");
        snapshot = await service.read(uid, projectId);
        await withRoom(server.hocuspocus, `projects/${projectId}/tables/table-existing`, doc => {
            doc.getText("schema").delete(0, doc.getText("schema").length);
            doc.getText("schema").insert(0, "CREATE TABLE existing_table (id TEXT, state state)");
        });
        const refused = await service.apply(uid, projectId, {
            expectedRevision: snapshot.revision,
            intent: { operation: "delete", objectId: "enum-state" },
        });
        expect(refused).to.include({ status: "refused", applied: false });
        expect((await service.read(uid, projectId)).objects).to.deep.equal(snapshot.objects);
    });
});
