/**
 * Schedule execution status semantics shared by the production scheduler and
 * the Schedules Manager (issue #5290).
 *
 * Three timestamps describe a Schedule and they are deliberately kept apart,
 * because conflating them is exactly the bug this module exists to prevent:
 *
 * - `lastRunStartedAt` — the wall clock at which the most recent execution
 *   *attempt began*. Written by the scheduler immediately before the job is
 *   dispatched, never derived from the occurrence/RRULE instant and never
 *   derived from a completion time.
 * - `lastSuccessfulRunAt` — the wall clock at which the most recent execution
 *   that *succeeded* completed. Only a successful terminal write touches it.
 * - `lastRunAt` — the pre-#5290 field: a completion-time observation written
 *   after every execution regardless of outcome. It is kept for backwards
 *   compatibility (MCP diagnostics, the Schedule detail view) and must never
 *   be reinterpreted as an execution-start timestamp.
 *
 * `completedAt` is unrelated: it marks recurrence exhaustion, not a run.
 */

/** The states the manager distinguishes for the most recent execution attempt. */
export type ScheduleRunResult = "never" | "running" | "success" | "failed" | "interrupted";

/** The value persisted in the Schedule's `lastRunStatus` field. */
export type ScheduleRunStatusValue = "running" | "ok" | "error" | "interrupted";

export const SCHEDULE_RUN_RESULT_LABELS: Record<ScheduleRunResult, string> = {
    never: "Never run",
    running: "Running",
    success: "Success",
    failed: "Failed",
    interrupted: "Interrupted",
};

/** The subset of persisted Schedule fields that describe execution telemetry. */
export interface ScheduleTelemetrySnapshot {
    lastRunStartedAt?: string;
    lastRunStatus?: string;
    lastRunError?: string;
    /** Legacy completion-time observation. Never an execution-start time. */
    lastRunAt?: string;
    lastSuccessfulRunAt?: string;
}

export interface ScheduleRunSummary {
    result: ScheduleRunResult;
    /** Execution-start instant of the run `result` describes, if one was recorded. */
    lastRunStartedAt?: string;
    /**
     * True when telemetry proves an execution happened but no start instant was
     * ever observed for it — pre-#5290 data. The manager shows an explicit
     * "not recorded" marker rather than promoting the completion time.
     */
    startTimeUnrecorded: boolean;
    lastRunError?: string;
    /** Completion instant of the most recent *successful* execution, if any. */
    lastSuccessfulRunAt?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * The successful-completion instant that legacy telemetry can justify.
 *
 * Only a stored `lastRunStatus === "ok"` proves that the recorded completion
 * time belonged to an execution that actually succeeded; anything else leaves
 * the value unknown, and an unknown successful run is reported as "never"
 * rather than invented from recurrence timing.
 */
export function legacySuccessfulRunAt(telemetry: ScheduleTelemetrySnapshot): string | undefined {
    if (nonEmpty(telemetry.lastSuccessfulRunAt)) return undefined;
    if (telemetry.lastRunStatus !== "ok") return undefined;
    return nonEmpty(telemetry.lastRunAt);
}

/** Collapse the persisted execution telemetry into what the manager renders. */
export function summarizeScheduleRun(telemetry: ScheduleTelemetrySnapshot): ScheduleRunSummary {
    const startedAt = nonEmpty(telemetry.lastRunStartedAt);
    const status = telemetry.lastRunStatus;

    let result: ScheduleRunResult;
    if (status === "running") result = "running";
    else if (status === "ok") result = "success";
    else if (status === "error") result = "failed";
    else if (status === "interrupted") result = "interrupted";
    else if (startedAt) result = "running";
    else result = "never";

    // A pre-#5290 Schedule carries a completion-style `lastRunAt` and its
    // outcome but no start observation. The outcome (and its failure
    // diagnostics) stays visible above; `Last run` stays empty rather than
    // borrowing the completion time.
    return {
        result,
        lastRunStartedAt: startedAt,
        startTimeUnrecorded: !startedAt && result !== "never",
        lastRunError: result === "failed" || result === "interrupted" ? nonEmpty(telemetry.lastRunError) : undefined,
        lastSuccessfulRunAt: nonEmpty(telemetry.lastSuccessfulRunAt) ?? legacySuccessfulRunAt(telemetry),
    };
}

/**
 * How the scheduler's own recurrence cursor should be presented.
 *
 * `scheduled` is the only state that carries a timestamp: every other state
 * means the scheduler has no eligible next occurrence (or has not published
 * one yet), and the manager must not substitute a locally computed
 * `rrule.after(now)` guess for it.
 */
export type ScheduleNextRunState =
    | "scheduled"
    | "disabled"
    | "completed"
    | "invalid"
    | "orphaned"
    | "pending"
    | "unavailable";

export const SCHEDULE_NEXT_RUN_LABELS: Record<Exclude<ScheduleNextRunState, "scheduled">, string> = {
    disabled: "Disabled",
    completed: "No further runs",
    invalid: "Invalid recurrence",
    orphaned: "Not scheduled",
    pending: "Awaiting scheduler",
    unavailable: "Unavailable",
};

export interface ScheduleNextRunSummary {
    state: ScheduleNextRunState;
    /** Only ever set for `scheduled`, and always the scheduler's own cursor. */
    nextRunAt?: string;
}

export interface ScheduleSchedulerStateSnapshot {
    enabled?: boolean;
    /** The scheduler index state the server published into the Schedule. */
    schedulerState?: string;
    /** The scheduler index cursor the server published into the Schedule. */
    schedulerNextRunAt?: string;
}

export function summarizeScheduleNextRun(snapshot: ScheduleSchedulerStateSnapshot): ScheduleNextRunSummary {
    // A Schedule the user just turned off must stop presenting its occurrence
    // as eligible immediately, before the scheduler has re-indexed it.
    if (snapshot.enabled === false) return { state: "disabled" };

    switch (nonEmpty(snapshot.schedulerState)) {
        case undefined:
            return { state: "unavailable" };
        case "active": {
            const nextRunAt = nonEmpty(snapshot.schedulerNextRunAt);
            return nextRunAt ? { state: "scheduled", nextRunAt } : { state: "unavailable" };
        }
        case "disabled":
            // Enabled in the shared document but still disabled in the index:
            // the scheduler has not reconciled the change yet (AS-005).
            return { state: "pending" };
        case "completed":
        case "exhausted":
            return { state: "completed" };
        case "invalid":
            return { state: "invalid" };
        case "orphaned":
            return { state: "orphaned" };
        default:
            return { state: "unavailable" };
    }
}
