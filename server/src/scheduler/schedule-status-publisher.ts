import type { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { legacySuccessfulRunAt } from "../../../shared/src/services/scheduleStatus.js";

/**
 * Publishing the scheduler's own state into the shared Schedule document
 * (issue #5290).
 *
 * `Next run` in the Schedules Manager must be the production scheduler's
 * authoritative recurrence cursor, not a client-side `rrule.after(now)`
 * approximation. The cursor lives in the server-only `schedule_index` table,
 * so the scheduler mirrors it into the Schedule's Yjs map, where the manager
 * observes it like any other shared field — no polling endpoint, and a live
 * update while the manager stays open.
 */

/** Transaction origin used for every scheduler-owned write (see AGENTS.md §11). */
export const SCHEDULER_ORIGIN = "server-scheduler";

/** The index states that can reach the client. `active` is the only one carrying a cursor. */
export type PublishedSchedulerState =
    | "active"
    | "disabled"
    | "exhausted"
    | "invalid"
    | "completed"
    | "orphaned";

export interface SchedulerCursor {
    state: PublishedSchedulerState;
    nextRunAt: string | null;
}

/**
 * What an execution produced, as it is recorded durably and then published.
 *
 * `completedAt` is fixed when the result is produced rather than when it is
 * written, so a republication after a failed publish carries the instant the
 * execution actually finished instead of the instant it was rescued.
 */
export interface RunOutcome {
    status: "ok" | "error";
    error?: string;
    completedAt: string;
    cursor?: SchedulerCursor;
    /**
     * When this execution began, supplied only where the document may not
     * already know: a result published onto a document that predates its own
     * claim would otherwise wear the *previous* execution's start time.
     */
    startedAt?: string;
}

/**
 * Write one execution's terminal result into the rule map, with the cursor it
 * consumed. Yjs delivers a transaction to observers as one change, so the
 * manager transitions from "running, next run T1" straight to "finished, next
 * run T2" with no intermediate state pairing the terminal result with the
 * occurrence it just spent.
 *
 * Idempotent: republishing a result that already landed rewrites the same
 * values, which is what lets recovery retry a publication it cannot confirm.
 *
 * Must be called inside a `document.transact(..., SCHEDULER_ORIGIN)`.
 */
export function applyRunOutcome(ruleItem: Y.Map<unknown>, outcome: RunOutcome): void {
    // `Last run` and `Result` must describe the same attempt, so a result that
    // knows when its execution began says so — otherwise it lands on whatever
    // start the document happens to be holding.
    if (outcome.startedAt) ruleItem.set("lastRunStartedAt", outcome.startedAt);
    // Kept for backwards compatibility: `lastRunAt` has always been a
    // completion-time observation and stays one.
    ruleItem.set("lastRunAt", outcome.completedAt);
    if (outcome.status === "ok") {
        ruleItem.set("lastRunStatus", "ok");
        ruleItem.delete("lastRunError");
        ruleItem.set("lastSuccessfulRunAt", outcome.completedAt);
    } else {
        ruleItem.set("lastRunStatus", "error");
        ruleItem.set("lastRunError", outcome.error || "Unknown error");
    }
    if (outcome.cursor) applySchedulerCursor(ruleItem, outcome.cursor);
}

/**
 * Mirror one index row into the rule map. Writes are change-guarded: an
 * unchanged cursor produces no Yjs update, so republishing on every store or
 * tick cannot loop through the document-store hook that calls it.
 *
 * Must be called inside a `document.transact(..., SCHEDULER_ORIGIN)`.
 */
export function applySchedulerCursor(ruleItem: Y.Map<unknown>, cursor: SchedulerCursor): void {
    if (ruleItem.get("schedulerState") !== cursor.state) {
        ruleItem.set("schedulerState", cursor.state);
    }

    // Only an active rule has an eligible next occurrence. A disabled,
    // exhausted, invalid or orphaned rule keeps its index row (so re-enabling
    // resumes where it left off) but must not leave a future timestamp in the
    // document for the manager to present as a real next run.
    const nextRunAt = cursor.state === "active" ? cursor.nextRunAt ?? undefined : undefined;
    if (nextRunAt === undefined) {
        if (ruleItem.get("schedulerNextRunAt") !== undefined) ruleItem.delete("schedulerNextRunAt");
    } else if (ruleItem.get("schedulerNextRunAt") !== nextRunAt) {
        ruleItem.set("schedulerNextRunAt", nextRunAt);
    }
}

/**
 * Seed `lastSuccessfulRunAt` from pre-#5290 telemetry, once, where the stored
 * result proves the recorded execution succeeded.
 *
 * The legacy `lastRunAt` is a completion-time observation. It may become a
 * successful-completion time; it may never become an execution-start time.
 *
 * Must be called inside a `document.transact(..., SCHEDULER_ORIGIN)`.
 */
export function applyLegacyTelemetryMigration(ruleItem: Y.Map<unknown>): void {
    const seed = legacySuccessfulRunAt({
        lastRunStatus: ruleItem.get("lastRunStatus") as string | undefined,
        lastRunAt: ruleItem.get("lastRunAt") as string | undefined,
        lastSuccessfulRunAt: ruleItem.get("lastSuccessfulRunAt") as string | undefined,
    });
    if (seed) ruleItem.set("lastSuccessfulRunAt", seed);
}

/** Publish a cursor the scheduler advanced during a tick into the project document. */
export async function publishSchedulerCursor(
    hocuspocus: Hocuspocus,
    room: string,
    ruleId: string,
    cursor: SchedulerCursor,
): Promise<void> {
    const connection = await hocuspocus.openDirectConnection(room);
    try {
        const document = connection.document;
        const ruleItem = document?.getMap("schedules").get(ruleId);
        if (!document || !(ruleItem instanceof Y.Map)) return;
        document.transact(() => applySchedulerCursor(ruleItem, cursor), SCHEDULER_ORIGIN);
    } finally {
        connection.disconnect();
    }
}
