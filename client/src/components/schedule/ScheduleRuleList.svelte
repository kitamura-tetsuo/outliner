<script lang="ts">
// The Schedules Manager table (issue #5290).
//
// A compact management surface in the spirit of Object Manager: one row per
// Schedule, exposing the operational state at a glance. Two rules govern what
// it may render:
//
//  * `Next run` is the production scheduler's own cursor, mirrored into the
//    Schedule document by the server. This component never computes
//    `rrule.after(now)` — a naive client calculation disagrees with the
//    scheduler whenever the cursor is overdue, catch-up-adjusted or
//    DST-adjusted, and would present a fabricated occurrence for a Schedule
//    that has none.
//  * `Last run` is the execution-*start* instant, `Last successful run` the
//    completion instant of the most recent success. The pre-#5290 `lastRunAt`
//    is a completion-time observation and is never promoted to either.
import type { ScheduleRule } from "../../services/schedule/scheduleRuleService";
import { rrulestr } from "rrule";
import {
    SCHEDULE_NEXT_RUN_LABELS,
    SCHEDULE_RUN_RESULT_LABELS,
    summarizeScheduleNextRun,
    summarizeScheduleRun,
    type ScheduleRunResult,
} from "$shared/services/scheduleStatus";
import { formatDateTime } from "../../utils/dateUtils";

interface Props {
    rules: { id: string, rule: ScheduleRule }[];
    onRunNow: (id: string) => void;
    runningRuleId?: string;
    onEdit: (id: string, rule: ScheduleRule) => void;
    onDelete: (id: string) => void;
    /** Turn one Schedule on or off. Absent when the manager is read-only. */
    onToggleEnabled?: (id: string, enabled: boolean) => void;
    /** Detail-page link for a Schedule, so row navigation stays available. */
    detailHref?: (id: string) => string;
    /**
     * Tables each rule references, keyed by rule id. A Schedule belongs to the
     * project and may touch several Tables (issue #5012), so this is a list of
     * links, never a single "owning" table.
     */
    tableReferences?: Record<string, { tableId: string; name: string; kind: string; href: string; }[]>;
    /**
     * Whether the viewer may mutate. False for a read-only viewer, who may
     * read every status column and open a Schedule but must not enable, run or
     * delete one. Edit stays enabled: it only navigates to the rule's own
     * (read-only-gated) page.
     */
    canWrite?: boolean;
}

let {
    rules,
    onRunNow,
    runningRuleId,
    onEdit,
    onDelete,
    onToggleEnabled,
    detailHref,
    tableReferences,
    canWrite = true,
}: Props = $props();

function getHumanReadable(rruleStr: string) {
    try {
        const rule = rrulestr(rruleStr);
        return rule.toText();
    } catch {
        return rruleStr;
    }
}

const NEVER = "—";

/**
 * Everything one row renders, derived in a single pass over one Schedule so
 * that `Last run`, `Result`, `Last successful run` and `Next run` always
 * describe the same snapshot rather than four independently read ones.
 */
function summarize(rule: ScheduleRule) {
    const run = summarizeScheduleRun(rule);
    const next = summarizeScheduleNextRun(rule);
    return {
        enabled: rule.enabled !== false,
        cadence: getHumanReadable(rule.rrule),
        timezone: rule.timezone,
        lastRun: run.lastRunStartedAt ? formatDateTime(run.lastRunStartedAt) : NEVER,
        startTimeUnrecorded: run.startTimeUnrecorded,
        result: run.result,
        resultLabel: SCHEDULE_RUN_RESULT_LABELS[run.result],
        lastRunError: run.lastRunError,
        lastSuccess: run.lastSuccessfulRunAt ? formatDateTime(run.lastSuccessfulRunAt) : NEVER,
        nextRun: next.state === "scheduled" ? formatDateTime(next.nextRunAt!) : undefined,
        nextRunLabel: next.state === "scheduled" ? undefined : SCHEDULE_NEXT_RUN_LABELS[next.state],
        nextRunState: next.state,
    };
}

const RESULT_CLASSES: Record<ScheduleRunResult, string> = {
    never: "bg-gray-100 text-gray-600",
    running: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    interrupted: "bg-amber-100 text-amber-800",
};
</script>

<div class="schedule-rule-list">
    {#if rules.length === 0}
        <p class="text-gray-500 text-sm">No schedule rules defined.</p>
    {:else}
        <table class="min-w-full text-sm border border-gray-200 bg-white" data-testid="schedules-manager-table">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Enabled</th>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Name</th>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Target</th>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Cadence</th>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Last run</th>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Result</th>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Last successful run</th>
                    <th scope="col" class="px-2 py-2 text-left font-medium">Next run</th>
                    <th scope="col" class="px-2 py-2 text-right font-medium">Actions</th>
                </tr>
            </thead>
            <tbody>
                {#each rules as {id, rule} (id)}
                    {@const row = summarize(rule)}
                    <tr class="border-t border-gray-200 align-top" data-testid="schedule-row" data-rule-id={id}>
                        <td class="px-2 py-2">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={row.enabled}
                                aria-label={`Enable schedule ${rule.name || id}`}
                                class="inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed {row.enabled ? 'bg-blue-600' : 'bg-gray-300'}"
                                disabled={!canWrite || !onToggleEnabled}
                                title={canWrite ? (row.enabled ? "Disable this schedule" : "Enable this schedule") : "Enabling is disabled for read-only access"}
                                data-testid="schedule-rule-enabled"
                                data-rule-id={id}
                                onclick={() => onToggleEnabled?.(id, !row.enabled)}
                            >
                                <span class="inline-block h-4 w-4 rounded-full bg-white transition-transform {row.enabled ? 'translate-x-4' : 'translate-x-0.5'}"></span>
                            </button>
                        </td>
                        <td class="px-2 py-2">
                            {#if detailHref}
                                <a class="text-blue-600 hover:underline font-medium" href={detailHref(id)} data-testid="schedule-rule-name">
                                    {rule.name || "Untitled Schedule"}
                                </a>
                            {:else}
                                <span class="font-medium text-gray-800" data-testid="schedule-rule-name">{rule.name || "Untitled Schedule"}</span>
                            {/if}
                        </td>
                        <td class="px-2 py-2">
                            {#if tableReferences?.[id]?.length}
                                <span class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs" data-testid="schedule-rule-tables">
                                    {#each tableReferences[id] as reference (reference.tableId)}
                                        <span>
                                            <a class="text-blue-600 hover:underline" href={reference.href} data-reference-kind={reference.kind}>{reference.name}</a>
                                            <span class="text-gray-400">({reference.kind})</span>
                                        </span>
                                    {/each}
                                </span>
                            {:else}
                                <span class="text-gray-400">{NEVER}</span>
                            {/if}
                        </td>
                        <td class="px-2 py-2 text-gray-700" data-testid="schedule-rule-cadence">
                            {row.cadence}
                            {#if row.timezone}<span class="block text-xs text-gray-400">{row.timezone}</span>{/if}
                        </td>
                        <td class="px-2 py-2 text-gray-700 whitespace-nowrap" data-testid="schedule-rule-last-run">
                            {#if row.startTimeUnrecorded}
                                <span class="text-gray-400" title="This execution predates start-time recording, so its start is unknown.">{NEVER}</span>
                            {:else}
                                {row.lastRun}
                            {/if}
                        </td>
                        <td class="px-2 py-2 whitespace-nowrap" data-testid="schedule-rule-result" data-result={row.result}>
                            <span class="inline-block px-2 py-0.5 rounded text-xs font-medium {RESULT_CLASSES[row.result]}">{row.resultLabel}</span>
                        </td>
                        <td class="px-2 py-2 text-gray-700 whitespace-nowrap" data-testid="schedule-rule-last-success">
                            {row.lastSuccess}
                        </td>
                        <td class="px-2 py-2 text-gray-700 whitespace-nowrap" data-testid="schedule-rule-next-run" data-next-run-state={row.nextRunState}>
                            {row.nextRun ?? row.nextRunLabel}
                        </td>
                        <td class="px-2 py-2 text-right whitespace-nowrap space-x-2">
                            <button
                                class="text-gray-700 hover:text-gray-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                onclick={() => onRunNow(id)}
                                disabled={runningRuleId === id || !canWrite}
                                title={canWrite ? "Runs the saved SQL" : "Run now is disabled for guest access"}
                                data-testid="schedule-rule-run-now"
                                data-rule-id={id}
                            >
                                {runningRuleId === id ? "Running…" : "Run now"}
                            </button>
                            <button class="text-blue-600 hover:text-blue-800 text-sm" onclick={() => onEdit(id, rule)} data-testid="schedule-rule-edit">Edit</button>
                            <button
                                class="text-red-600 hover:text-red-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                onclick={() => onDelete(id)}
                                disabled={!canWrite}
                                title={canWrite ? undefined : "Deleting is disabled for guest access"}
                                data-testid="schedule-rule-delete"
                                data-rule-id={id}
                            >Delete</button>
                        </td>
                    </tr>

                    <!-- Operational failure information stays on the manager: a
                         compact table must not be the reason an error message
                         becomes unreachable (issue #5290 REQ-010). -->
                    {#if row.lastRunError || rule.validationError || rule.skippedOccurrences}
                        <tr class="border-t border-gray-100" data-testid="schedule-row-diagnostics" data-rule-id={id}>
                            <td colspan="9" class="px-2 pb-2">
                                {#if row.lastRunError}
                                    <div class="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-100 font-mono" data-testid="schedule-rule-last-run-error">
                                        {row.lastRunError}
                                    </div>
                                {/if}
                                {#if rule.validationError}
                                    <div class="mt-1 text-xs bg-red-50 text-red-600 p-2 rounded border border-red-100">
                                        <strong>Validation Error:</strong> {rule.validationError}
                                    </div>
                                {/if}
                                {#if rule.skippedOccurrences}
                                    <div class="mt-1 text-xs bg-yellow-50 text-yellow-700 p-2 rounded border border-yellow-200">
                                        <strong>Warning:</strong> {rule.skippedOccurrences} occurrence(s) were missed while the server was down and have been skipped.
                                    </div>
                                {/if}
                            </td>
                        </tr>
                    {/if}
                {/each}
            </tbody>
        </table>
    {/if}
</div>
