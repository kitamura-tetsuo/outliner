import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import type {
    CatalogReplayService,
    ConfirmedCatalogEdit,
} from "../../client/src/services/undo/sqlCatalogUndoAdapter.js";
import type { UndoRouter as UndoRouterType } from "../../client/src/services/undo/undoRouter.svelte.js";
import { createDocumentLoader, createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import {
    AclStore,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    waitFor,
    withRoom,
} from "./server-create-table-fixture.js";

const projectId = "catalog-undo-production";
const uid = "catalog-owner";
const original = { id: "enum-state", kind: "enum" as const, source: "CREATE TYPE state AS ENUM ('open', 'done')" };
const changed = { ...original, source: "CREATE TYPE state AS ENUM ('open', 'doing', 'done')" };

function replayService(service: SqlCatalogMutationService): CatalogReplayService {
    return {
        read: project => service.read(uid, project),
        apply: (project, request) => service.apply(uid, project, request),
        reconcile: (project, intended) => service.reconcile(uid, project, intended),
    };
}

async function settle(router: UndoRouterType) {
    await waitFor(() => !router.isPending, 30000);
}

describe("SQL catalog Undo with the production service (#5537 REQ-007)", function() {
    this.timeout(90000);
    let dir: string;
    let server: TestServer;
    let acl: AclStore;
    let ordinary: SqlCatalogMutationService;
    let UndoRouter: typeof UndoRouterType;
    let captureConfirmedCatalogEdit: (
        router: UndoRouterType,
        receipt: ConfirmedCatalogEdit,
        service: CatalogReplayService,
        active: (project: string) => boolean,
    ) => void;

    before(async () => {
        // Svelte compiles this rune to identity-like reactive state. The router's
        // server integration test needs only its ordinary array semantics.
        (globalThis as { $state?: <T>(value?: T) => T; }).$state = <T>(value?: T) => value as T;
        ({ UndoRouter } = await import("../../client/src/services/undo/undoRouter.svelte.js"));
        ({ captureConfirmedCatalogEdit } = await import("../../client/src/services/undo/sqlCatalogUndoAdapter.js"));
    });

    beforeEach(async () => {
        dir = tempDir();
        acl = new AclStore();
        acl.grant("projectUsers", projectId, uid);
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, projectId);
        ordinary = new SqlCatalogMutationService(
            server.hocuspocus,
            acl.checkAccess,
            createDocumentStore(server.persistence!),
            { loadStoredDocument: createDocumentLoader(server.persistence!) },
        );
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    async function create() {
        const initial = await ordinary.read(uid, projectId);
        const result = await ordinary.apply(uid, projectId, {
            expectedRevision: initial.revision,
            intent: { operation: "create", object: original },
        });
        expect(result.status).to.equal("applied");
        if (result.status !== "applied") throw new Error("Expected catalog creation to apply");
        return result;
    }

    it("keeps one real replay pending across repeated commands and an unrelated edit", async () => {
        const created = await create();
        let release!: () => void;
        let reached!: () => void;
        const atPublication = new Promise<void>(resolve => reached = resolve);
        const barrier = new Promise<void>(resolve => release = resolve);
        let publications = 0;
        const guarded = new SqlCatalogMutationService(
            server.hocuspocus,
            acl.checkAccess,
            createDocumentStore(server.persistence!),
            {
                loadStoredDocument: createDocumentLoader(server.persistence!),
                beforePublication: async () => {
                    publications++;
                    reached();
                    await barrier;
                },
            },
        );
        const router = new UndoRouter();
        const doc = new Y.Doc();
        const unrelated = doc.getMap<number>("ordinary");
        router.register(new Y.UndoManager(unrelated));
        captureConfirmedCatalogEdit(router, created, replayService(guarded), () => true);

        router.undo();
        await atPublication;
        router.undo();
        router.redo();
        unrelated.set("preserved", 1);
        expect(publications).to.equal(1);
        expect([router.undoDepth, router.redoDepth]).to.deep.equal([2, 0]);
        release();
        await settle(router);

        expect((await ordinary.read(uid, projectId)).objects).to.deep.equal([]);
        expect(unrelated.get("preserved")).to.equal(1);
        expect([router.undoDepth, router.redoDepth]).to.deep.equal([1, 1]);
        router.redo();
        await settle(router);
        expect((await ordinary.read(uid, projectId)).objects).to.deep.equal([original]);
        expect([router.undoDepth, router.redoDepth]).to.deep.equal([2, 0]);
    });

    it("keeps history on real reference refusal, peer conflict, and revoked authorization", async () => {
        const created = await create();
        const router = new UndoRouter();
        captureConfirmedCatalogEdit(router, created, replayService(ordinary), () => true);
        await withRoom(server.hocuspocus, `projects/${projectId}/tables/table-existing`, doc => {
            const schema = doc.getText("schema");
            schema.delete(0, schema.length);
            schema.insert(0, "CREATE TABLE existing_table (id TEXT, state state)");
        });
        router.undo();
        await settle(router);
        expect(router.lastAsyncOutcome?.status).to.equal("refused");
        expect([router.undoDepth, router.redoDepth]).to.deep.equal([1, 0]);
        expect((await ordinary.read(uid, projectId)).objects).to.deep.equal([original]);

        await withRoom(server.hocuspocus, `projects/${projectId}/tables/table-existing`, doc => {
            const schema = doc.getText("schema");
            schema.delete(0, schema.length);
            schema.insert(0, "CREATE TABLE existing_table (id TEXT)");
        });
        const beforePeer = await ordinary.read(uid, projectId);
        expect(
            (await ordinary.apply(uid, projectId, {
                expectedRevision: beforePeer.revision,
                intent: { operation: "replace", object: changed },
            })).status,
        ).to.equal("applied");
        router.undo();
        await settle(router);
        expect(router.lastAsyncOutcome?.status).to.equal("conflict");
        expect((await ordinary.read(uid, projectId)).objects).to.deep.equal([changed]);
        expect([router.undoDepth, router.redoDepth]).to.deep.equal([1, 0]);

        acl.revokeAll(projectId);
        router.undo();
        await settle(router);
        expect(router.lastAsyncOutcome?.status).to.equal("refused");
        expect([router.undoDepth, router.redoDepth]).to.deep.equal([1, 0]);
    });

    it("settles an unconfirmed mutation only after persisted-source reconciliation", async () => {
        const created = await create();
        const store = createDocumentStore(server.persistence!);
        const uncertain = new SqlCatalogMutationService(
            server.hocuspocus,
            acl.checkAccess,
            async (room, doc) => {
                await store(room, doc);
                throw new Error("acknowledgement lost after durable store");
            },
            { loadStoredDocument: createDocumentLoader(server.persistence!) },
        );
        const router = new UndoRouter();
        captureConfirmedCatalogEdit(router, created, replayService(uncertain), () => true);
        router.undo();
        await settle(router);

        expect(router.lastAsyncOutcome?.status).to.equal("applied");
        expect([router.undoDepth, router.redoDepth]).to.deep.equal([0, 1]);
        expect((await ordinary.read(uid, projectId)).objects).to.deep.equal([]);
        expect((await uncertain.reconcile(uid, projectId, { objectId: original.id })).status)
            .to.equal("durable-match");
    });
});
