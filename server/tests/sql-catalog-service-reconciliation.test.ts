import { expect } from "chai";
import fs from "fs-extra";
import { createDocumentLoader, createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import {
    AclStore,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
} from "./server-create-table-fixture.js";

describe("SQL catalog uncertain persistence reconciliation (#5532 REQ-009)", function() {
    this.timeout(120000);
    const projectId = "catalog-reconciliation-project";
    const uid = "catalog-owner";
    let dir: string;
    let server: TestServer;
    let acl: AclStore;

    beforeEach(async () => {
        dir = tempDir();
        acl = new AclStore();
        acl.grant("projectUsers", projectId, uid);
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, projectId);
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    it("reports unconfirmed publication and distinguishes live, durable, conflicting and unavailable evidence", async () => {
        const realStore = createDocumentStore(server.persistence!);
        const realLoader = createDocumentLoader(server.persistence!);
        const confirmed = new SqlCatalogMutationService(server.hocuspocus, acl.checkAccess, realStore, {
            loadStoredDocument: realLoader,
        });
        const initial = await confirmed.read(uid, projectId);
        const original = {
            id: "enum-reconcile",
            kind: "enum" as const,
            source: "CREATE TYPE reconcile_state AS ENUM ('one')",
        };
        const created = await confirmed.apply(uid, projectId, {
            expectedRevision: initial.revision,
            intent: { operation: "create", object: original },
        });
        expect(created.status).to.equal("applied");
        expect((await confirmed.reconcile(uid, projectId, original)).status).to.equal("durable-match");

        // Keep the production room live so a failed explicit acknowledgement
        // cannot be confused with an unload/reload from the older durable state.
        const holder = await server.hocuspocus.openDirectConnection(`projects/${projectId}`, { context: { uid } });
        const persistenceStore = server.persistence!.configuration.store;
        try {
            server.persistence!.configuration.store = async () => {
                throw new Error("storage acknowledgement unavailable");
            };
            let releaseStore!: () => void;
            let mutationReached!: () => void;
            const atMutationBoundary = new Promise<void>(resolve => mutationReached = resolve);
            const storeBarrier = new Promise<void>(resolve => releaseStore = resolve);
            const uncertain = new SqlCatalogMutationService(
                server.hocuspocus,
                acl.checkAccess,
                realStore,
                {
                    loadStoredDocument: realLoader,
                    afterMutationBeforeStore: async () => {
                        mutationReached();
                        await storeBarrier;
                    },
                },
            );
            const before = await uncertain.read(uid, projectId);
            const replacement = { ...original, source: "CREATE TYPE reconcile_state AS ENUM ('one', 'two')" };
            const applying = uncertain.apply(uid, projectId, {
                expectedRevision: before.revision,
                intent: { operation: "replace", object: replacement },
            });
            await atMutationBoundary;
            const liveAtBoundary = server.hocuspocus.documents.get(`projects/${projectId}`);
            if (!liveAtBoundary) throw new Error("Expected the mutated live Project document at the storage boundary");
            expect((await uncertain.reconcile(uid, projectId, replacement)).status).to.equal("live-only-match");
            expect((await uncertain.reconcile(uid, projectId, original)).status).to.equal("conflict");
            releaseStore();
            const outcome = await applying;
            expect(outcome).to.include({ status: "unconfirmed", applied: false });

            const unavailable = new SqlCatalogMutationService(server.hocuspocus, acl.checkAccess, undefined, {
                loadStoredDocument: async () => {
                    throw new Error("persistence unavailable");
                },
            });
            expect((await unavailable.reconcile(uid, projectId, replacement)).status).to.equal("unavailable");

            server.persistence!.configuration.store = persistenceStore;
            await realStore(`projects/${projectId}`, liveAtBoundary as never);
            expect((await uncertain.reconcile(uid, projectId, replacement)).status).to.equal("durable-match");
        } finally {
            server.persistence!.configuration.store = persistenceStore;
            await holder.disconnect();
        }

        const current = await confirmed.read(uid, projectId);
        const deleted = await confirmed.apply(uid, projectId, {
            expectedRevision: current.revision,
            intent: { operation: "delete", objectId: original.id },
        });
        expect(deleted.status).to.equal("applied");
        expect((await confirmed.reconcile(uid, projectId, { objectId: original.id })).status)
            .to.equal("durable-match");
    });
});
