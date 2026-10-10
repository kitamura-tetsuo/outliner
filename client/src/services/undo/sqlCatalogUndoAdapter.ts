import type { SqlCatalogSnapshot, SqlCatalogSourceObject } from "$shared/services/sqlCatalog";
import type { AsyncUndoEntry, AsyncUndoOutcome, UndoRouter } from "./undoRouter.svelte";

export type CatalogReplayRefusal = {
    readonly status: "refused";
    readonly reason: string;
};

export type CatalogReplayApplyResult = CatalogReplayRefusal | {
    readonly status: "applied";
    readonly applied: true;
    readonly before: SqlCatalogSnapshot;
    readonly after: SqlCatalogSnapshot;
} | {
    readonly status: "no-op";
    readonly applied: false;
    readonly before: SqlCatalogSnapshot;
    readonly after: SqlCatalogSnapshot;
} | {
    readonly status: "unconfirmed";
    readonly reason: string;
};

export interface CatalogReplayService {
    read(projectId: string): Promise<SqlCatalogSnapshot>;
    apply(
        projectId: string,
        request: {
            readonly expectedRevision: string;
            readonly intent:
                | { readonly operation: "create"; readonly object: SqlCatalogSourceObject; }
                | { readonly operation: "replace"; readonly object: SqlCatalogSourceObject; }
                | { readonly operation: "delete"; readonly objectId: string; };
        },
    ): Promise<CatalogReplayApplyResult>;
    reconcile(
        projectId: string,
        intended: SqlCatalogSourceObject | { readonly objectId: string; readonly object?: SqlCatalogSourceObject; },
    ): Promise<{ readonly status: "durable-match" | "live-only-match" | "conflict" | "unavailable"; }>;
}

export interface ConfirmedCatalogEdit {
    readonly status: "applied";
    readonly applied: true;
    readonly objectIds: readonly string[];
    readonly before: SqlCatalogSnapshot;
    readonly after: SqlCatalogSnapshot;
}

function objectMap(snapshot: SqlCatalogSnapshot): Map<string, SqlCatalogSourceObject> {
    return new Map(snapshot.objects.map(object => [object.id, object]));
}

function sameObject(left: SqlCatalogSourceObject | undefined, right: SqlCatalogSourceObject | undefined): boolean {
    return left?.id === right?.id && left?.kind === right?.kind && left?.source === right?.source;
}

function intentFor(
    expected: SqlCatalogSourceObject | undefined,
    desired: SqlCatalogSourceObject | undefined,
) {
    if (!desired) return { operation: "delete" as const, objectId: expected!.id };
    return { operation: expected ? "replace" as const : "create" as const, object: desired };
}

/**
 * Capture the receipt of a production catalog-service mutation. Preview,
 * refusal, no-op and uncertain results cannot be represented by this input,
 * which keeps them out of history by construction.
 */
export function captureConfirmedCatalogEdit(
    router: UndoRouter,
    receipt: ConfirmedCatalogEdit,
    service: CatalogReplayService,
    isProjectActive: (projectId: string) => boolean,
): void {
    if (receipt.before.projectId !== receipt.after.projectId || receipt.objectIds.length !== 1) return;
    const projectId = receipt.after.projectId;
    const id = receipt.objectIds[0];
    const before = objectMap(receipt.before).get(id);
    const after = objectMap(receipt.after).get(id);
    if (sameObject(before, after)) return;

    const entry: AsyncUndoEntry = {
        type: "async",
        label: "SQL catalog source edit",
        projectId,
        affectedObjectIds: [id],
        beforeSource: before ? [before] : [],
        afterSource: after ? [after] : [],
        isActive: () => isProjectActive(projectId),
        replay: async direction => {
            const expected = direction === "undo" ? after : before;
            const desired = direction === "undo" ? before : after;
            let current: SqlCatalogSnapshot;
            try {
                current = await service.read(projectId);
            } catch (error) {
                return failure("refused", error);
            }
            if (!sameObject(objectMap(current).get(id), expected)) {
                return { status: "conflict", reason: `Catalog object ${id} no longer has the expected source` };
            }

            let result: CatalogReplayApplyResult;
            try {
                result = await service.apply(projectId, {
                    expectedRevision: current.revision,
                    intent: intentFor(expected, desired),
                });
            } catch (error) {
                return failure("unconfirmed", error);
            }
            if (result.status === "applied" && result.applied) return { status: "applied" };
            if (result.status === "refused") return { status: "refused", reason: result.reason };
            if (result.status === "no-op") {
                return { status: "conflict", reason: "Catalog replay unexpectedly produced no source change" };
            }

            const intended = desired ?? { objectId: id, object: undefined };
            try {
                const reconciliation = await service.reconcile(projectId, intended);
                if (reconciliation.status === "durable-match") return { status: "applied" };
                return {
                    status: reconciliation.status === "conflict" ? "conflict" : "unconfirmed",
                    reason: result.reason,
                };
            } catch (error) {
                return failure("unconfirmed", error);
            }
        },
    };
    router.captureAsync(entry);
}

function failure(status: "refused" | "unconfirmed", error: unknown): AsyncUndoOutcome {
    return { status, reason: error instanceof Error ? error.message : String(error) };
}
