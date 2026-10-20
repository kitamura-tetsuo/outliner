import { expect } from "chai";
import * as Y from "yjs";
import { createDocumentStore } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { deferred, withRoom } from "./server-create-table-fixture.js";

/** The barrier wraps completed native execution; it never replaces its verdict. */
describe("Grid publication after a real catalog mutation", function() {
    this.timeout(60000);
    it("refuses the old execution and preserves the peer's actual catalog state", async () => {
        const f = await startMcpTestServer();
        const validated = deferred();
        const resume = deferred();
        const target = f.relations as unknown as { validateGridCandidate: (...args: unknown[]) => Promise<unknown>; };
        const original = target.validateGridCandidate.bind(f.relations);
        let held = false;
        target.validateGridCandidate = async (...args) => {
            const result = await original(...args);
            if (!held) {
                held = true;
                validated.resolve();
                await resume.promise;
            }
            return result;
        };
        try {
            const pageId = await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                return [...Project.fromDoc(doc).items][0].id;
            });
            const pending = f.mcp.call("create_grid", {
                projectId: PROJECT,
                pageId,
                query: "SELECT 1 AS answer",
                operationId: "catalog-held-grid",
            });
            await validated.promise;
            const catalog = new SqlCatalogMutationService(
                f.server.hocuspocus,
                f.acl.checkAccess,
                createDocumentStore(f.server.persistence!),
            );
            const before = await catalog.read(UID, PROJECT);
            const applied = await catalog.apply(UID, PROJECT, {
                expectedRevision: before.revision,
                intent: {
                    operation: "create",
                    object: {
                        id: "peer-enum",
                        kind: "enum",
                        source: "CREATE TYPE peer_state AS ENUM ('ready','done')",
                    },
                },
            });
            expect(applied.status).to.equal("applied");
            const snapshot = () =>
                withRoom(
                    f.server.hocuspocus,
                    `projects/${PROJECT}`,
                    doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
                );
            const afterPeer = await snapshot();
            resume.resolve();
            const refused = await pending;
            expect(refused.payload.code).to.equal("stale_revision");
            expect(await snapshot()).to.equal(afterPeer);
        } finally {
            resume.resolve();
            await f.stop();
        }
    });
});
