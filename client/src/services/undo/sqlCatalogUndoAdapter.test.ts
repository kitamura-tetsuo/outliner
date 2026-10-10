import type { SqlCatalogSnapshot, SqlCatalogSourceObject } from "$shared/services/sqlCatalog";
import { describe, expect, it } from "vitest";
import {
    captureConfirmedCatalogEdit,
    type CatalogReplayApplyResult,
    type CatalogReplayService,
} from "./sqlCatalogUndoAdapter";
import { UndoRouter } from "./undoRouter.svelte";

function snapshot(revision: string, objects: readonly SqlCatalogSourceObject[]): SqlCatalogSnapshot {
    return { projectId: "project-a", format: 1, revision, objects };
}

async function settled(): Promise<void> {
    for (let turn = 0; turn < 6; turn++) await Promise.resolve();
}

class CatalogServiceFixture implements CatalogReplayService {
    current: SqlCatalogSnapshot;
    applyCalls = 0;
    nextOutcome: "applied" | "refused" | "unconfirmed" = "applied";
    reconcileStatus: "durable-match" | "conflict" | "unavailable" = "unavailable";

    constructor(initial: SqlCatalogSnapshot) {
        this.current = initial;
    }

    async read(): Promise<SqlCatalogSnapshot> {
        return this.current;
    }

    async apply(
        _projectId: string,
        request: Parameters<CatalogReplayService["apply"]>[1],
    ): Promise<CatalogReplayApplyResult> {
        this.applyCalls++;
        if (this.nextOutcome === "refused") return { status: "refused" as const, reason: "referenced" };
        if (this.nextOutcome === "unconfirmed") return { status: "unconfirmed" as const, reason: "store unavailable" };
        const before = this.current;
        const objects = [...before.objects];
        const intent = request.intent;
        if (intent.operation === "delete") {
            objects.splice(objects.findIndex(object => object.id === intent.objectId), 1);
        } else {
            const index = objects.findIndex(object => object.id === intent.object.id);
            if (index === -1) objects.push(intent.object);
            else objects[index] = intent.object;
        }
        this.current = snapshot(`revision-${this.applyCalls}`, objects);
        return { status: "applied" as const, applied: true, before, after: this.current };
    }

    async reconcile() {
        return { status: this.reconcileStatus };
    }
}

describe("SQL catalog Undo adapter", () => {
    const original = { id: "enum-a", kind: "enum" as const, source: "CREATE TYPE mood AS ENUM ('ok')" };
    const changed = { id: "enum-a", kind: "enum" as const, source: "CREATE TYPE mood AS ENUM ('ok', 'great')" };

    it("replays exact before and after source and moves history only after confirmation", async () => {
        const before = snapshot("before", [original]);
        const after = snapshot("after", [changed]);
        const service = new CatalogServiceFixture(after);
        const router = new UndoRouter();
        captureConfirmedCatalogEdit(
            router,
            { status: "applied", applied: true, objectIds: [original.id], before, after },
            service,
            () => true,
        );

        router.undo();
        expect(router.undoDepth).toBe(1);
        await settled();
        expect(service.current.objects).toEqual([original]);
        expect([router.undoDepth, router.redoDepth]).toEqual([0, 1]);

        router.redo();
        await settled();
        expect(service.current.objects).toEqual([changed]);
        expect([router.undoDepth, router.redoDepth]).toEqual([1, 0]);
    });

    it("refuses a peer change without submitting or consuming history", async () => {
        const before = snapshot("before", [original]);
        const after = snapshot("after", [changed]);
        const peer = { ...changed, source: "CREATE TYPE mood AS ENUM ('peer')" };
        const service = new CatalogServiceFixture(snapshot("peer", [peer]));
        const router = new UndoRouter();
        captureConfirmedCatalogEdit(
            router,
            { status: "applied", applied: true, objectIds: [original.id], before, after },
            service,
            () => true,
        );

        router.undo();
        await settled();
        expect(service.applyCalls).toBe(0);
        expect(service.current.objects).toEqual([peer]);
        expect(router.undoDepth).toBe(1);
        expect(router.lastAsyncOutcome?.status).toBe("conflict");
    });

    it("settles an unconfirmed publication only after durable reconciliation", async () => {
        const before = snapshot("before", []);
        const after = snapshot("after", [changed]);
        const service = new CatalogServiceFixture(after);
        service.nextOutcome = "unconfirmed";
        service.reconcileStatus = "durable-match";
        const router = new UndoRouter();
        captureConfirmedCatalogEdit(
            router,
            { status: "applied", applied: true, objectIds: [changed.id], before, after },
            service,
            () => true,
        );

        router.undo();
        await settled();
        expect(service.applyCalls).toBe(1);
        expect([router.undoDepth, router.redoDepth]).toEqual([0, 1]);
        expect(router.lastAsyncOutcome?.status).toBe("applied");
    });
});
