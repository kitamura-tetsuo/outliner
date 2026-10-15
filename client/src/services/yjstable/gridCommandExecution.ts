import type { GridPastePlan } from "./gridClipboard";
import type {
    GridExistingRowMutationBoundary,
    GridMutationIntent,
    GridMutationResult,
} from "./gridExistingRowMutation";
import type {
    GridCommandContext,
    GridCommandOutcome,
    GridCommandRowTarget,
    GridWritableCellTarget,
} from "./gridSelectionCommands";
import type { TableRecordValue } from "./tableDocs";

/** A command result distinguishes a refusal before effects from a provider failure after effects. */
export type GridExecutionOutcome =
    | { status: "applied"; applied: GridMutationResult[]; }
    | { status: "refused"; applied: []; reason: string; }
    | { status: "partial"; applied: GridMutationResult[]; failedIntent: GridMutationIntent; error: unknown; };

export interface GridGuardedCommandContext extends Pick<GridCommandContext, "rowTargets"> {
    boundary: GridExistingRowMutationBoundary;
}

function rowIndexOf(ctx: GridGuardedCommandContext, target: GridCommandRowTarget): number {
    for (const candidate of ctx.rowTargets.values()) {
        if (candidate === target && candidate.rowIndex !== undefined) return candidate.rowIndex;
    }
    throw new Error("Grid command refused: the selected row has no captured result occurrence");
}

function captureUpdates(
    ctx: GridGuardedCommandContext,
    writes: readonly { target: GridWritableCellTarget; value: TableRecordValue; }[],
): GridMutationIntent[] {
    return writes.map(write =>
        ctx.boundary.captureUpdate(rowIndexOf(ctx, write.target.rowTarget), write.target.columnId, write.value)
    );
}

/**
 * Executes a completely planned command through the provenance boundary.
 * Every intent is captured before provider resolution and `commitMany`
 * resolves/revalidates every physical target before its first effect.
 */
export async function executeGridWrites(
    ctx: GridGuardedCommandContext,
    writes: readonly { target: GridWritableCellTarget; value: TableRecordValue; }[],
): Promise<GridExecutionOutcome> {
    if (writes.length === 0) return { status: "refused", applied: [], reason: "no-writable-cells" };
    let intents: GridMutationIntent[];
    try {
        intents = captureUpdates(ctx, writes);
    } catch (error) {
        return { status: "refused", applied: [], reason: error instanceof Error ? error.message : String(error) };
    }
    try {
        const result = await ctx.boundary.commitMany(intents);
        if (result.failed) {
            return {
                status: "partial",
                applied: result.applied,
                failedIntent: result.failed.intent,
                error: result.failed.error,
            };
        }
        return { status: "applied", applied: result.applied };
    } catch (error) {
        return { status: "refused", applied: [], reason: error instanceof Error ? error.message : String(error) };
    }
}

export async function executeGridPastePlan(
    ctx: GridGuardedCommandContext,
    plan: GridPastePlan,
): Promise<GridExecutionOutcome> {
    if (plan.kind !== "apply") return { status: "refused", applied: [], reason: plan.kind };
    return executeGridWrites(ctx, plan.writes);
}

export async function executeGridRowDeletion(
    ctx: GridGuardedCommandContext,
    targets: readonly GridCommandRowTarget[],
): Promise<GridExecutionOutcome> {
    if (targets.length === 0) return { status: "refused", applied: [], reason: "no-writable-rows" };
    let intents: GridMutationIntent[];
    try {
        intents = targets.map(target => ctx.boundary.captureDelete(rowIndexOf(ctx, target)));
    } catch (error) {
        return { status: "refused", applied: [], reason: error instanceof Error ? error.message : String(error) };
    }
    try {
        const result = await ctx.boundary.commitMany(intents);
        if (result.failed) {
            return {
                status: "partial",
                applied: result.applied,
                failedIntent: result.failed.intent,
                error: result.failed.error,
            };
        }
        return { status: "applied", applied: result.applied };
    } catch (error) {
        return { status: "refused", applied: [], reason: error instanceof Error ? error.message : String(error) };
    }
}

/** Maps the legacy summary into writes without granting it write authority. */
export function writesForValue(
    outcome: GridCommandOutcome,
    targets: readonly GridWritableCellTarget[],
    value: TableRecordValue,
): Array<{ target: GridWritableCellTarget; value: TableRecordValue; }> {
    return outcome.applied ? targets.map(target => ({ target, value })) : [];
}
