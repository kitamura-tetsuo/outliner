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

describe("SQL catalog correction of synchronized invalid records (#5533 REQ-004/REQ-008)", function() {
    this.timeout(90000);
    const projectId = "catalog-repair-project";
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

    it("adds the exact missing label without repairing records or allowing referenced label removal", async () => {
        const object = { id: "enum-mood", kind: "enum" as const, source: "CREATE TYPE mood AS ENUM ('ok', 'bad')" };
        expect(
            (await service.apply(uid, projectId, {
                expectedRevision: (await service.read(uid, projectId)).revision,
                intent: { operation: "create", object },
            })).status,
        ).to.equal("applied");
        const room = `projects/${projectId}/tables/table-existing`;
        await withRoom(server.hocuspocus, room, doc => {
            const schema = doc.getText("schema");
            schema.delete(0, schema.length);
            schema.insert(0, "CREATE TABLE existing_table (id TEXT PRIMARY KEY, mood mood)");
            for (const [id, mood] of [["row-ok", "ok"], ["row-invalid", "Waiting  "]]) {
                const record = new Y.Map<unknown>();
                record.set("id", id);
                record.set("mood", mood);
                doc.getMap<Y.Map<unknown>>("data").set(id, record);
            }
        });
        const tableState = () =>
            withRoom(server.hocuspocus, room, doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"));
        const before = await tableState();
        const revision = (await service.read(uid, projectId)).revision;
        const replace = (source: string) =>
            service.apply(uid, projectId, {
                expectedRevision: revision,
                intent: { operation: "replace", object: { ...object, source } },
            });

        const stillInvalid = await replace("CREATE TYPE mood AS ENUM ('bad', 'ok', 'Waiting')");
        expect(stillInvalid).to.include({ status: "refused", reason: "invalid-candidate", applied: false });
        const destructive = await replace("CREATE TYPE mood AS ENUM ('ok', 'Waiting  ')");
        expect(destructive).to.include({ status: "refused", reason: "referenced", applied: false });
        expect((await service.read(uid, projectId)).revision).to.equal(revision);
        expect(await tableState()).to.equal(before);

        const source = "CREATE TYPE mood AS ENUM ('bad', 'ok', 'Waiting  ')";
        expect((await replace(source)).status).to.equal("applied");
        expect((await service.read(uid, projectId)).objects).to.deep.equal([{ ...object, source }]);
        expect(await tableState()).to.equal(before);
    });
});
