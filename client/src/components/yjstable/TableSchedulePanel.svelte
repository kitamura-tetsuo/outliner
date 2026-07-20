<script lang="ts">
import {
    createScheduleRule,
    deleteScheduleRule,
    type ScheduleRule,
    updateScheduleRule
} from "../../services/schedule/scheduleRuleService";
import { store } from "../../stores/store.svelte";
import ScheduleRuleEditor from "../schedule/ScheduleRuleEditor.svelte";
import ScheduleRuleList from "../schedule/ScheduleRuleList.svelte";

interface Props {
    tableId: string;
}

let { tableId }: Props = $props();

let rules = $state<{ id: string, rule: ScheduleRule }[]>([]);
let editingRuleId = $state<string | undefined>(undefined);
let isCreating = $state(false);

let schedulesMap = $derived(store.project?.schedules);

function syncRules() {
    if (!schedulesMap) {
        rules = [];
        return;
    }
    const nextRules: { id: string, rule: ScheduleRule }[] = [];
    schedulesMap.forEach((ruleMap, id) => {
        if (ruleMap.get("targetTableId") === tableId) {
            nextRules.push({
                id,
                rule: {
                    targetTableId: ruleMap.get("targetTableId") as string,
                    sql: ruleMap.get("sql") as string,
                    rrule: ruleMap.get("rrule") as string,
                    dtstart: ruleMap.get("dtstart") as string,
                    timezone: ruleMap.get("timezone") as string,
                    enabled: ruleMap.get("enabled") as boolean,
                    catchUp: ruleMap.get("catchUp") as boolean,
                    lastRunAt: ruleMap.get("lastRunAt") as string | undefined,
                    completedAt: ruleMap.get("completedAt") as string | undefined,
                    validationError: ruleMap.get("validationError") as string | undefined,
                }
            });
        }
    });
    rules = nextRules;
}

const mapObserver = () => syncRules();

$effect(() => {
    if (schedulesMap) {
        schedulesMap.observeDeep(mapObserver);
        syncRules();
        return () => {
            schedulesMap?.unobserveDeep(mapObserver);
        };
    }
});

function handleEdit(id: string, _rule: ScheduleRule) {
    editingRuleId = id;
    isCreating = false;
}

function handleDelete(id: string) {
    if (confirm("Are you sure you want to delete this schedule rule?") && store.project) {
        deleteScheduleRule(store.project, id);
    }
}

function handleSave(ruleData: Partial<ScheduleRule> & { sql: string, rrule: string, targetTableId: string }) {
    if (!store.project) return;

    if (isCreating) {
        createScheduleRule(store.project, ruleData);
    } else if (editingRuleId) {
        updateScheduleRule(store.project, editingRuleId, ruleData);
    }

    isCreating = false;
    editingRuleId = undefined;
}

function handleCancel() {
    isCreating = false;
    editingRuleId = undefined;
}

let editingRuleData = $derived(
    editingRuleId ? rules.find(r => r.id === editingRuleId)?.rule : undefined
);
</script>

<div class="table-schedule-panel" data-testid="table-schedule-panel">
    <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold">Schedule Rules</h3>
        {#if !isCreating && !editingRuleId}
            <button
                class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                onclick={() => isCreating = true}
            >
                + New Rule
            </button>
        {/if}
    </div>

    {#if isCreating || editingRuleId}
        <ScheduleRuleEditor
            rule={editingRuleData}
            {tableId}
            onSave={handleSave}
            onCancel={handleCancel}
        />
    {:else}
        <ScheduleRuleList
            {rules}
            onEdit={handleEdit}
            onDelete={handleDelete}
        />
    {/if}
</div>

<style>
.table-schedule-panel {
    padding: 16px;
    background: #fff;
    border-radius: 4px;
}
</style>
