import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
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

describe("SQL catalog final publication boundary (#5532 REQ-003/REQ-005)", function() {
    this.timeout(120000);
    const projectId = "catalog-final-boundary";
    const uid = "catalog-owner";
    let dir: string;
    let server: TestServer;
    let acl: AclStore;
    const ordinary = () =>
        new SqlCatalogMutationService(
            server.hocuspocus,
            acl.checkAccess,
            createDocumentStore(server.persistence!),
        );

    beforeEach(async () => {
        dir = tempDir();
        acl = new AclStore();
        acl.grant("projectUsers", projectId, uid);
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, projectId);
        await withRoom(server.hocuspocus, `projects/${projectId}`, doc => {
            const entry = new Y.Map<unknown>();
            entry.set("name", "Second");
            entry.set("sqlName", "second_table");
            doc.getMap<Y.Map<unknown>>("yjsTables").set("table-second", entry);
        });
        await withRoom(
            server.hocuspocus,
            `projects/${projectId}/tables/table-second`,
            doc => doc.getText("schema").insert(0, "CREATE TABLE second_table (id TEXT)"),
        );
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    async function createEnum(service: SqlCatalogMutationService) {
        const initial = await service.read(uid, projectId);
        const source = "CREATE TYPE mood AS ENUM ('ok')";
        expect(
            (await service.apply(uid, projectId, {
                expectedRevision: initial.revision,
                intent: { operation: "create", object: { id: "enum-mood", kind: "enum", source } },
            })).status,
        ).to.equal("applied");
        return { source, snapshot: await service.read(uid, projectId) };
    }

    it("rechecks authorization after final Table preparation", async () => {
        const base = ordinary();
        const { source, snapshot } = await createEnum(base);
        let release!: () => void;
        let reached!: () => void;
        const boundary = new Promise<void>(resolve => reached = resolve);
        const barrier = new Promise<void>(resolve => release = resolve);
        const service = new SqlCatalogMutationService(server.hocuspocus, acl.checkAccess, undefined, {
            beforeTableOpen: async (phase, _id, index) => {
                if (phase === "publication" && index === 1) {
                    reached();
                    await barrier;
                }
            },
        });
        const applying = service.apply(uid, projectId, {
            expectedRevision: snapshot.revision,
            intent: { operation: "delete", objectId: "enum-mood" },
        });
        await boundary;
        acl.revokeAll(projectId);
        expect(await acl.checkAccess(uid, projectId)).to.equal(false);
        release();
        let code: string | undefined;
        try {
            await applying;
        } catch (error) {
            code = (error as { code?: string; }).code;
        }
        expect(code).to.equal("forbidden");
        acl.grant("projectUsers", projectId, uid);
        expect((await base.read(uid, projectId)).objects[0]?.source).to.equal(source);
    });

    it("resamples an earlier held Table synchronously before deleting the ENUM", async () => {
        const base = ordinary();
        const { source, snapshot } = await createEnum(base);
        const holder = await server.hocuspocus.openDirectConnection(
            `projects/${projectId}/tables/table-existing`,
            { context: { uid } },
        );
        let release!: () => void;
        let reached!: () => void;
        const boundary = new Promise<void>(resolve => reached = resolve);
        const barrier = new Promise<void>(resolve => release = resolve);
        const service = new SqlCatalogMutationService(server.hocuspocus, acl.checkAccess, undefined, {
            beforeTableOpen: async (phase, _id, index) => {
                if (phase === "publication" && index === 1) {
                    reached();
                    await barrier;
                }
            },
        });
        const applying = service.apply(uid, projectId, {
            expectedRevision: snapshot.revision,
            intent: { operation: "delete", objectId: "enum-mood" },
        });
        await boundary;
        const liveTable = server.hocuspocus.documents.get(`projects/${projectId}/tables/table-existing`);
        if (!liveTable) throw new Error("Expected Table A to be held live during final capture");
        const schema = (liveTable as unknown as Y.Doc).getText("schema");
        schema.delete(0, schema.length);
        schema.insert(0, "CREATE TABLE existing_table (id TEXT, mood mood)");
        expect(schema.toString()).to.contain("mood mood");
        release();
        const result = await applying;
        expect(result).to.include({ status: "refused", reason: "stale", applied: false });
        expect((await base.read(uid, projectId)).objects[0]?.source).to.equal(source);
        await holder.disconnect();
    });
});
