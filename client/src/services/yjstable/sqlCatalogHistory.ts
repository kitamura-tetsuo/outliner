import type { SqlCatalogSnapshot, SqlCatalogSourceObject } from "$shared/services/sqlCatalog";
import {
    captureConfirmedCatalogEdit,
    type CatalogReplayApplyResult,
    type CatalogReplayService,
} from "../undo/sqlCatalogUndoAdapter";
import type { UndoRouter } from "../undo/undoRouter.svelte";
import {
    applyCatalogMutation,
    fetchCatalogSnapshot,
    type SqlCatalogMutationDto,
    type SqlCatalogSnapshotDto,
    SqlCatalogTransportError,
} from "./sqlCatalogClient";

function toSharedSnapshot(dto: SqlCatalogSnapshotDto): SqlCatalogSnapshot {
    return {
        projectId: dto.projectId,
        format: 1,
        objects: dto.objects.map(object => ({ id: object.id, kind: "enum" as const, source: object.source })),
        revision: dto.revision,
    };
}

function sameSourceObject(
    left: SqlCatalogSourceObject | undefined,
    right: SqlCatalogSourceObject | undefined,
): boolean {
    return left?.id === right?.id && left?.kind === right?.kind && left?.source === right?.source;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

/**
 * Parse a confirmed receipt snapshot field (`before`/`after`) into a shared
 * snapshot. Returns undefined unless the field carries a usable revision and
 * object list, so callers can fall back to the display snapshot for receipts
 * that omit snapshots (older test doubles) without absorbing peer edits or
 * losing history when the refresh fails.
 */
function receiptSnapshot(value: unknown, fallbackProjectId: string): SqlCatalogSnapshot | undefined {
    const record = asRecord(value);
    if (!record || typeof record["revision"] !== "string" || !Array.isArray(record["objects"])) {
        return undefined;
    }
    const projectId = typeof record["projectId"] === "string" ? record["projectId"] : fallbackProjectId;
    const objects: SqlCatalogSourceObject[] = [];
    for (const entry of record["objects"]) {
        const objectRecord = asRecord(entry);
        if (!objectRecord || typeof objectRecord["id"] !== "string" || typeof objectRecord["source"] !== "string") {
            return undefined;
        }
        if (objectRecord["kind"] !== "enum") return undefined;
        objects.push({ id: objectRecord["id"], kind: "enum", source: objectRecord["source"] });
    }
    return {
        projectId,
        format: 1,
        objects,
        revision: record["revision"] as string,
    };
}

/**
 * Map the authenticated apply receipt to the guarded history adapter's
 * replay vocabulary. Transport denials throw and are classified by the
 * caller; only the service's own unconfirmed/refused/no-op/applied verdicts
 * arrive here as values.
 */
export function toReplayResult(result: unknown, before: SqlCatalogSnapshot): CatalogReplayApplyResult {
    const record = asRecord(result);
    if (!record) return { status: "unconfirmed", reason: "Catalog service returned an unknown receipt" };
    const status = record["status"];
    if (status === "applied") {
        const confirmedBefore = receiptSnapshot(record["before"], before.projectId) ?? before;
        const afterRecord = asRecord(record["after"]);
        if (!afterRecord || typeof afterRecord["revision"] !== "string" || !Array.isArray(afterRecord["objects"])) {
            return { status: "unconfirmed", reason: "Catalog service returned no confirmed snapshot" };
        }
        return {
            status: "applied",
            applied: true,
            before: confirmedBefore,
            after: toSharedSnapshot({
                projectId: confirmedBefore.projectId,
                format: 1,
                objects: afterRecord["objects"] as SqlCatalogSnapshotDto["objects"],
                revision: afterRecord["revision"] as string,
            }),
        };
    }
    if (status === "no-op") return { status: "no-op", applied: false, before, after: before };
    if (status === "refused") {
        const reason = record["reason"];
        return { status: "refused", reason: typeof reason === "string" ? reason : "refused" };
    }
    if (status === "unconfirmed") {
        const reason = record["reason"];
        return { status: "unconfirmed", reason: typeof reason === "string" ? reason : "unconfirmed" };
    }
    return { status: "unconfirmed", reason: "Catalog service returned an unknown receipt" };
}

/**
 * Authenticated replay service for the catalog history adapter (issue #5577).
 * Every read and mutation travels the server router with the Firebase ID
 * token; callers never supply a client-declared UID. Reconciliation has no
 * separate durable view from the browser, so a live snapshot that already
 * holds the intended source is only a live-only-match (never durable-match)
 * while any other live state is a conflict and an unreadable service is
 * unavailable.
 */
export function createTransportCatalogReplayService(projectId: string): CatalogReplayService {
    return {
        read: async (project: string): Promise<SqlCatalogSnapshot> => {
            const dto = await fetchCatalogSnapshot(project);
            return toSharedSnapshot(dto);
        },
        apply: async (
            project: string,
            request: {
                readonly expectedRevision: string;
                readonly intent: SqlCatalogMutationDto["intent"];
            },
        ): Promise<CatalogReplayApplyResult> => {
            let before: SqlCatalogSnapshot;
            try {
                before = toSharedSnapshot(await fetchCatalogSnapshot(project));
            } catch (error) {
                if (error instanceof SqlCatalogTransportError && error.code === "forbidden") throw error;
                return { status: "unconfirmed", reason: error instanceof Error ? error.message : String(error) };
            }
            let result: unknown;
            try {
                result = await applyCatalogMutation(project, {
                    expectedRevision: request.expectedRevision,
                    intent: request.intent,
                });
            } catch (error) {
                // A denied grant stays a refusal so history is preserved; any
                // other transport failure is unconfirmed, never a silent queue.
                if (error instanceof SqlCatalogTransportError && error.code === "forbidden") throw error;
                if (error instanceof SqlCatalogTransportError && error.status === 403) throw error;
                return { status: "unconfirmed", reason: error instanceof Error ? error.message : String(error) };
            }
            void projectId;
            return toReplayResult(result, before);
        },
        reconcile: async (
            project: string,
            intended: SqlCatalogSourceObject | { readonly objectId: string; readonly object?: SqlCatalogSourceObject; },
        ): Promise<{ readonly status: "durable-match" | "live-only-match" | "conflict" | "unavailable"; }> => {
            const objectId = "objectId" in intended ? intended.objectId : intended.id;
            const desired = "objectId" in intended ? intended.object : intended;
            let live: SqlCatalogSnapshot;
            try {
                live = toSharedSnapshot(await fetchCatalogSnapshot(project));
            } catch {
                return { status: "unavailable" };
            }
            const current = live.objects.find(object => object.id === objectId);
            // The browser holds only the live snapshot; without a durable
            // read it cannot confirm persistence. A live match stays
            // live-only-match so the adapter preserves history as unconfirmed
            // instead of consuming the step as applied.
            if (sameSourceObject(current, desired)) return { status: "live-only-match" };
            return { status: "conflict" };
        },
    };
}

/**
 * Record exactly one history step for a confirmed effectful edit. Previews,
 * no-ops, refusals and unconfirmed receipts cannot be represented by the
 * `ConfirmedCatalogEdit` input, which keeps them out of history by
 * construction. Returns true only when a step was captured.
 */
export function captureAppliedTransportEdit(
    router: UndoRouter,
    before: SqlCatalogSnapshotDto,
    after: SqlCatalogSnapshotDto,
    objectId: string,
    service: CatalogReplayService,
    isActive: (projectId: string) => boolean,
    result?: unknown,
): boolean {
    const beforeShared = toSharedSnapshot(before);
    // Prefer the server's confirmed receipt snapshots over the display
    // refresh: a failed refresh leaves the display snapshot unchanged (zero
    // steps despite a confirmed effect) and a concurrent peer edit replaces
    // the display snapshot with unconfirmed third-party source (absorbing the
    // peer edit into this user's step). Fall back to the display snapshot
    // only when the receipt carries no usable snapshots.
    const record = asRecord(result);
    const confirmedAfter = record && record["status"] === "applied"
        ? receiptSnapshot(record["after"], before.projectId)
        : undefined;
    const confirmedBefore = record && record["status"] === "applied"
        ? receiptSnapshot(record["before"], before.projectId)
        : undefined;
    const effectiveBefore = confirmedAfter && confirmedBefore && confirmedBefore.projectId === confirmedAfter.projectId
        ? confirmedBefore
        : beforeShared;
    const afterShared = confirmedAfter ?? toSharedSnapshot(after);
    const beforeObject = effectiveBefore.objects.find(object => object.id === objectId);
    const afterObject = afterShared.objects.find(object => object.id === objectId);
    if (sameSourceObject(beforeObject, afterObject)) return false;
    captureConfirmedCatalogEdit(
        router,
        { status: "applied", applied: true, objectIds: [objectId], before: effectiveBefore, after: afterShared },
        service,
        isActive,
    );
    return true;
}
