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

describe("SQL catalog referenced ENUM evolution (#5532 REQ-006)", function() {
    this.timeout(90000);
    const projectId = "catalog-reference-project";
    const uid = "catalog-owner";
    let dir: string;
    let server: TestServer;
    let service: SqlCatalogMutationService;

    beforeEach(async () => {
        dir = tempDir();
        const acl = new AclStore();
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

    it("refuses removing an unused label from a referenced ENUM without changing sources or records", async () => {
        const initial = await service.read(uid, projectId);
        const source = "CREATE TYPE mood AS ENUM ('ok', 'bad')";
        const created = await service.apply(uid, projectId, {
            expectedRevision: initial.revision,
            intent: { operation: "create", object: { id: "enum-mood", kind: "enum", source } },
        });
        expect(created.status).to.equal("applied");

        await withRoom(server.hocuspocus, `projects/${projectId}/tables/table-existing`, doc => {
            const schema = doc.getText("schema");
            schema.delete(0, schema.length);
            schema.insert(0, "CREATE TABLE existing_table (id TEXT PRIMARY KEY, mood mood)");
            const record = new Y.Map<unknown>();
            record.set("id", "row-1");
            record.set("mood", "ok");
            doc.getMap<Y.Map<unknown>>("data").set("row-1", record);
        });
        const beforeTable = await withRoom(
            server.hocuspocus,
            `projects/${projectId}/tables/table-existing`,
            doc => ({ schema: doc.getText("schema").toString(), data: doc.getMap("data").toJSON() }),
        );
        const current = await service.read(uid, projectId);
        const refused = await service.apply(uid, projectId, {
            expectedRevision: current.revision,
            intent: {
                operation: "replace",
                object: { id: "enum-mood", kind: "enum", source: "CREATE TYPE mood AS ENUM ('ok')" },
            },
        });

        expect(refused).to.include({ status: "refused", applied: false, reason: "referenced" });
        expect((await service.read(uid, projectId)).objects).to.deep.equal([
            { id: "enum-mood", kind: "enum", source },
        ]);
        const afterTable = await withRoom(
            server.hocuspocus,
            `projects/${projectId}/tables/table-existing`,
            doc => ({ schema: doc.getText("schema").toString(), data: doc.getMap("data").toJSON() }),
        );
        expect(afterTable).to.deep.equal(beforeTable);
    });

    it("allows adding and reordering labels on a referenced ENUM without changing Table state", async () => {
        const initial = await service.read(uid, projectId);
        const original = "CREATE TYPE mood AS ENUM ('ok', 'bad')";
        expect(
            (await service.apply(uid, projectId, {
                expectedRevision: initial.revision,
                intent: { operation: "create", object: { id: "enum-mood", kind: "enum", source: original } },
            })).status,
        ).to.equal("applied");
        await withRoom(server.hocuspocus, `projects/${projectId}/tables/table-existing`, doc => {
            const schema = doc.getText("schema");
            schema.delete(0, schema.length);
            schema.insert(0, "CREATE TABLE existing_table (id TEXT PRIMARY KEY, mood mood)");
            const record = new Y.Map<unknown>();
            record.set("id", "row-1");
            record.set("mood", "ok");
            doc.getMap<Y.Map<unknown>>("data").set("row-1", record);
        });
        const tableState = () =>
            withRoom(
                server.hocuspocus,
                `projects/${projectId}/tables/table-existing`,
                doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            );
        const beforeTable = await tableState();

        const reorderedSource = "CREATE TYPE mood AS ENUM ('bad', 'ok')";
        let current = await service.read(uid, projectId);
        expect(
            (await service.apply(uid, projectId, {
                expectedRevision: current.revision,
                intent: {
                    operation: "replace",
                    object: { id: "enum-mood", kind: "enum", source: reorderedSource },
                },
            })).status,
        ).to.equal("applied");
        expect((await service.read(uid, projectId)).objects[0]?.source).to.equal(reorderedSource);
        expect(await tableState()).to.equal(beforeTable);

        const addedSource = "CREATE TYPE mood AS ENUM ('ok', 'bad', 'new')";
        current = await service.read(uid, projectId);
        expect(
            (await service.apply(uid, projectId, {
                expectedRevision: current.revision,
                intent: {
                    operation: "replace",
                    object: { id: "enum-mood", kind: "enum", source: addedSource },
                },
            })).status,
        ).to.equal("applied");
        expect((await service.read(uid, projectId)).objects[0]?.source).to.equal(addedSource);
        expect(await tableState()).to.equal(beforeTable);
    });
});
