import { expect } from "chai";
import express from "express";
import fs from "fs-extra";
import request from "supertest";
import { createDocumentStore } from "../src/persistence.js";
import { createSqlCatalogRouter } from "../src/sql-catalog-routes.js";
import {
    AclStore,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
} from "./server-create-table-fixture.js";

describe("SQL catalog browser transport (#5574)", function() {
    this.timeout(90000);
    const projectId = "catalog-routes-project";
    const uid = "catalog-owner";
    let dir: string;
    let server: TestServer;
    let acl: AclStore;
    let app: express.Express;

    const tokens: Record<string, string> = {
        "good-owner": uid,
        "good-stranger": "catalog-stranger",
    };

    beforeEach(async () => {
        dir = tempDir();
        acl = new AclStore();
        acl.grant("projectUsers", projectId, uid);
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, projectId);
        app = express();
        app.use(express.json());
        app.use(
            "/api",
            createSqlCatalogRouter(
                server.hocuspocus,
                createDocumentStore(server.persistence!),
                {
                    checkContainerAccess: acl.checkAccess,
                    verifyIdTokenCached: (async (token: string) => {
                        const resolved = tokens[token];
                        if (!resolved) throw new Error("invalid token");
                        return { uid: resolved } as never;
                    }) as never,
                },
            ),
        );
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    it("refuses unauthenticated and unauthorized catalog traffic before the service", async () => {
        await request(app).get("/api/sql-catalog/read").query({ projectId }).expect(401);
        await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-stranger").expect(403);
        await request(app).post("/api/sql-catalog/apply")
            .set("Authorization", "Bearer good-stranger")
            .send({
                projectId,
                expectedRevision: "stale",
                intent: {
                    operation: "create",
                    object: { id: "enum-x", kind: "enum", source: "CREATE TYPE x AS ENUM ('a')" },
                },
            }).expect(403);
    });

    it("reads, previews without effect, applies, edits and deletes through HTTP", async () => {
        const read = await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-owner").expect(200);
        const revision = read.body.snapshot.revision as string;
        expect(read.body.snapshot.objects).to.deep.equal([]);

        const source = "CREATE TYPE priority_level AS ENUM ('high','medium','low')";
        const preview = await request(app).post("/api/sql-catalog/validate")
            .set("Authorization", "Bearer good-owner")
            .send({
                projectId,
                expectedRevision: revision,
                intent: { operation: "create", object: { id: "enum-priority", kind: "enum", source } },
            }).expect(200);
        expect(preview.body.result.status).to.equal("preview");
        const unchanged = await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-owner").expect(200);
        expect(unchanged.body.snapshot.objects).to.deep.equal([]);

        const applied = await request(app).post("/api/sql-catalog/apply")
            .set("Authorization", "Bearer good-owner")
            .send({
                projectId,
                expectedRevision: revision,
                intent: { operation: "create", object: { id: "enum-priority", kind: "enum", source } },
            }).expect(200);
        expect(applied.body.result.status).to.equal("applied");

        const listed = await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-owner").expect(200);
        expect(listed.body.snapshot.objects).to.deep.equal([{ id: "enum-priority", kind: "enum", source }]);

        const stale = await request(app).post("/api/sql-catalog/apply")
            .set("Authorization", "Bearer good-owner")
            .send({
                projectId,
                expectedRevision: revision,
                intent: { operation: "create", object: { id: "enum-other", kind: "enum", source } },
            }).expect(200);
        expect(stale.body.result).to.include({ status: "refused", reason: "stale" });

        const edited = "CREATE TYPE priority_level AS ENUM ('high','medium','low','urgent')";
        const replaced = await request(app).post("/api/sql-catalog/apply")
            .set("Authorization", "Bearer good-owner")
            .send({
                projectId,
                expectedRevision: listed.body.snapshot.revision,
                intent: { operation: "replace", object: { id: "enum-priority", kind: "enum", source: edited } },
            }).expect(200);
        expect(replaced.body.result.status).to.equal("applied");

        const afterEdit = await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-owner").expect(200);
        expect(afterEdit.body.snapshot.objects).to.deep.equal([
            { id: "enum-priority", kind: "enum", source: edited },
        ]);

        const deleted = await request(app).post("/api/sql-catalog/apply")
            .set("Authorization", "Bearer good-owner")
            .send({
                projectId,
                expectedRevision: afterEdit.body.snapshot.revision,
                intent: { operation: "delete", objectId: "enum-priority" },
            }).expect(200);
        expect(deleted.body.result.status).to.equal("applied");
        const afterDelete = await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-owner").expect(200);
        expect(afterDelete.body.snapshot.objects).to.deep.equal([]);
    });

    it("reports non-ENUM DDL as refused instead of applying it", async () => {
        const read = await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-owner").expect(200);
        const refused = await request(app).post("/api/sql-catalog/apply")
            .set("Authorization", "Bearer good-owner")
            .send({
                projectId,
                expectedRevision: read.body.snapshot.revision,
                intent: {
                    operation: "create",
                    object: { id: "enum-table", kind: "enum", source: "CREATE TABLE t (id TEXT PRIMARY KEY)" },
                },
            }).expect(200);
        expect(refused.body.result.status).to.equal("refused");
        expect(refused.body.result.reason).to.equal("invalid-candidate");
        const unchanged = await request(app).get("/api/sql-catalog/read").query({ projectId })
            .set("Authorization", "Bearer good-owner").expect(200);
        expect(unchanged.body.snapshot.objects).to.deep.equal([]);
    });
});
