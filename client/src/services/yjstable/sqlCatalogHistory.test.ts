import type { SqlCatalogSnapshot } from "$shared/services/sqlCatalog";
import { describe, expect, it, vi } from "vitest";
import { UndoRouter } from "../undo/undoRouter.svelte";
import { captureAppliedTransportEdit, createTransportCatalogReplayService, toReplayResult } from "./sqlCatalogHistory";

function dtoSnapshot(revision: string, objects: { id: string; source: string; }[]) {
    return {
        projectId: "demo-project",
        format: 1 as const,
        objects: objects.map(object => ({ id: object.id, kind: "enum", source: object.source })),
        revision,
    };
}

describe("sqlCatalogHistory transport mapping", () => {
    it("maps applied, no-op, refused and unconfirmed receipts", () => {
        const before: SqlCatalogSnapshot = {
            projectId: "demo-project",
            format: 1,
            objects: [],
            revision: "rev-0",
        };
        const applied = toReplayResult(
            { status: "applied", after: { revision: "rev-1", objects: [] } },
            before,
        );
        expect(applied.status).toBe("applied");
        expect(toReplayResult({ status: "no-op" }, before).status).toBe("no-op");
        expect(toReplayResult({ status: "refused", reason: "referenced" }, before)).toEqual({
            status: "refused",
            reason: "referenced",
        });
        expect(toReplayResult({ status: "unconfirmed", reason: "stale" }, before).status).toBe("unconfirmed");
        expect(toReplayResult({ status: "preview" }, before).status).toBe("unconfirmed");
    });

    it("captures exactly one step for an effectful edit and none for a no-op", () => {
        const router = new UndoRouter();
        const service = createTransportCatalogReplayService("demo-project");
        const before = dtoSnapshot("rev-0", []);
        const after = dtoSnapshot("rev-1", [{ id: "enum-1", source: "CREATE TYPE t AS ENUM ('a')" }]);
        expect(captureAppliedTransportEdit(router, before, after, "enum-1", service, () => true)).toBe(true);
        expect(router.undoDepth).toBe(1);
        expect(captureAppliedTransportEdit(router, after, after, "enum-1", service, () => true)).toBe(false);
        expect(router.undoDepth).toBe(1);
    });

    it("reconciles a live match as live-only, never durable, without a durable view", async () => {
        const service = createTransportCatalogReplayService("demo-project");
        const fetchMock = vi.spyOn(await import("./sqlCatalogClient"), "fetchCatalogSnapshot");
        fetchMock.mockResolvedValueOnce(dtoSnapshot("rev-1", [{
            id: "enum-1",
            source: "CREATE TYPE t AS ENUM ('a')",
        }]) as never);
        const outcome = await service.reconcile("demo-project", {
            id: "enum-1",
            kind: "enum",
            source: "CREATE TYPE t AS ENUM ('a')",
        });
        expect(outcome.status).toBe("live-only-match");
        fetchMock.mockRestore();
    });

    it("keeps history unconfirmed when an unconfirmed replay sees a live-matching source", async () => {
        const { captureConfirmedCatalogEdit } = await import("../undo/sqlCatalogUndoAdapter");
        const client = await import("./sqlCatalogClient");
        const beforeSource = "CREATE TYPE t AS ENUM ('a')";
        const afterSource = "CREATE TYPE t AS ENUM ('a', 'b')";
        const liveHoldingAfter = dtoSnapshot("rev-1", [{ id: "enum-1", source: afterSource }]);
        const liveMatchingIntended = dtoSnapshot("rev-1", [{ id: "enum-1", source: beforeSource }]);
        const fetchMock = vi.spyOn(client, "fetchCatalogSnapshot");
        fetchMock.mockResolvedValue(liveMatchingIntended as never);
        fetchMock.mockResolvedValueOnce(liveHoldingAfter as never);
        fetchMock.mockResolvedValueOnce(liveHoldingAfter as never);
        const applyMock = vi.spyOn(client, "applyCatalogMutation");
        applyMock.mockResolvedValue({ status: "unconfirmed", reason: "store unavailable" } as never);
        try {
            const service = createTransportCatalogReplayService("demo-project");
            const router = new UndoRouter();
            const beforeShared: SqlCatalogSnapshot = {
                projectId: "demo-project",
                format: 1,
                objects: [{ id: "enum-1", kind: "enum", source: beforeSource }],
                revision: "rev-0",
            };
            const afterShared: SqlCatalogSnapshot = {
                projectId: "demo-project",
                format: 1,
                objects: [{ id: "enum-1", kind: "enum", source: afterSource }],
                revision: "rev-1",
            };
            captureConfirmedCatalogEdit(
                router,
                { status: "applied", applied: true, objectIds: ["enum-1"], before: beforeShared, after: afterShared },
                service,
                () => true,
            );
            router.undo();
            for (let turn = 0; turn < 20; turn++) await Promise.resolve();
            expect(router.lastAsyncOutcome?.status).toBe("unconfirmed");
            expect(router.undoDepth).toBe(1);
            expect(router.redoDepth).toBe(0);
        } finally {
            fetchMock.mockRestore();
            applyMock.mockRestore();
        }
    });
});
