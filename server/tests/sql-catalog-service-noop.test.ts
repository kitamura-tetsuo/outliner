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

describe("SQL catalog exact-source no-op (#5532 REQ-006)", function() {
    this.timeout(90000);
    const projectId = "catalog-noop-project";
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

    it("returns no-op without compiling an unrelated empty Calendar query or changing documents", async () => {
        const source = "CREATE TYPE mood AS ENUM ('ok', 'bad')";
        const initial = await service.read(uid, projectId);
        expect(
            (await service.apply(uid, projectId, {
                expectedRevision: initial.revision,
                intent: { operation: "create", object: { id: "enum-mood", kind: "enum", source } },
            })).status,
        ).to.equal("applied");
        await withRoom(server.hocuspocus, `projects/${projectId}`, doc => {
            const calendar = new Y.Map<unknown>();
            calendar.set("name", "Empty calendar");
            calendar.set("query", "");
            doc.getMap<Y.Map<unknown>>("calendars").set("calendar-empty", calendar);
        });
        const projectBefore = await withRoom(
            server.hocuspocus,
            `projects/${projectId}`,
            doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
        );
        const tableBefore = await withRoom(
            server.hocuspocus,
            `projects/${projectId}/tables/table-existing`,
            doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
        );
        const current = await service.read(uid, projectId);
        const result = await service.apply(uid, projectId, {
            expectedRevision: current.revision,
            intent: { operation: "replace", object: { id: "enum-mood", kind: "enum", source } },
        });
        expect(result).to.include({ status: "no-op", applied: false });
        if (result.status !== "no-op") throw new Error("Expected exact-source no-op");
        expect(result.after.revision).to.equal(current.revision);
        expect(
            await withRoom(
                server.hocuspocus,
                `projects/${projectId}`,
                doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            ),
        ).to.equal(projectBefore);
        expect(
            await withRoom(
                server.hocuspocus,
                `projects/${projectId}/tables/table-existing`,
                doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            ),
        ).to.equal(tableBefore);
    });
});
