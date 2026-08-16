<script lang="ts">
import type { ScheduleRule } from "../../services/schedule/scheduleRuleService";
import { rrulestr } from "rrule";
import { formatDateTime } from "../../utils/dateUtils";

interface Props {
    rules: { id: string, rule: ScheduleRule }[];
    onEdit: (id: string, rule: ScheduleRule) => void;
    onDelete: (id: string) => void;
}

let { rules, onEdit, onDelete }: Props = $props();

function getHumanReadable(rruleStr: string) {
    try {
        const rule = rrulestr(rruleStr);
        return rule.toText();
    } catch {
        return rruleStr;
    }
}

function getNextRun(rruleStr: string, dtstartStr: string) {
    try {
        let dtstart = undefined;
        if (dtstartStr) {
            dtstart = new Date(dtstartStr);
        }

        const rule = rrulestr(rruleStr, { dtstart });
        const now = new Date();
        const next = rule.after(now);
        return next ? formatDateTime(next.getTime()) : "None";
    } catch {
        return "Unknown";
    }
}

</script>

<div class="schedule-rule-list">
    {#if rules.length === 0}
        <p class="text-gray-500 text-sm">No schedule rules defined for this table.</p>
    {:else}
        <ul class="space-y-3">
            {#each rules as {id, rule} (id)}
                <li class="border rounded p-3 bg-white shadow-sm flex flex-col space-y-2">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="font-medium text-gray-800">{getHumanReadable(rule.rrule)}</span>
                            {#if rule.enabled === false}
                                <span class="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Disabled</span>
                            {/if}
                            {#if rule.completedAt}
                                <span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Completed</span>
                            {/if}
                        </div>
                        <div class="space-x-2">
                            <button class="text-blue-600 hover:text-blue-800 text-sm" onclick={() => onEdit(id, rule)}>Edit</button>
                            <button class="text-red-600 hover:text-red-800 text-sm" onclick={() => onDelete(id)}>Delete</button>
                        </div>
                    </div>

                    <div class="text-xs text-gray-500 grid grid-cols-2 gap-2">
                        <div>
                            <span class="font-medium">Next run:</span> {getNextRun(rule.rrule, rule.dtstart)}
                        </div>
                        <div>
                            <span class="font-medium">Last run:</span> {rule.lastRunAt ? formatDateTime(new Date(rule.lastRunAt).getTime()) : "Never"}
                            {#if rule.lastRunStatus === "ok"}
                                <span class="ml-1 text-green-700 font-medium">(OK)</span>
                            {:else if rule.lastRunStatus === "error"}
                                <span class="ml-1 text-red-700 font-medium">(Error)</span>
                            {/if}
                        </div>
                    </div>

                    {#if rule.lastRunStatus === "error" && rule.lastRunError}
                        <div class="mt-1 text-xs text-red-700 bg-red-50 p-2 rounded border border-red-100 font-mono">
                            {rule.lastRunError}
                        </div>
                    {/if}

                    {#if rule.validationError}
                        <div class="mt-2 text-xs bg-red-50 text-red-600 p-2 rounded border border-red-100">
                            <strong>Validation Error:</strong> {rule.validationError}
                        </div>
                    {/if}
                    {#if rule.skippedOccurrences}
                        <div class="mt-2 text-xs bg-yellow-50 text-yellow-700 p-2 rounded border border-yellow-200">
                            <strong>Warning:</strong> {rule.skippedOccurrences} occurrence(s) were missed while the server was down and have been skipped.
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</div>
