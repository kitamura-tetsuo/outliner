<script lang="ts">
import { store } from "../../stores/store.svelte";
import ScheduleRuleList from "../schedule/ScheduleRuleList.svelte";
import ScheduleRuleEditor from "../schedule/ScheduleRuleEditor.svelte";
import { createScheduleRule, deleteScheduleRule, updateScheduleRule, type ScheduleRule } from "../../services/schedule/scheduleRuleService";

interface Props {
    tableId: string;
}

let { tableId }: Props = $props();

let isEditing = $state(false);
let currentRuleId: string | undefined = $state(undefined);
let currentRule: Partial<ScheduleRule> | undefined = $state(undefined);

let rules = $state<{ id: string, rule: ScheduleRule }[]>([]);

function loadRules() {
    if (!store.project || !tableId) return;

    const project = store.project;
    const newRules: { id: string, rule: ScheduleRule }[] = [];

    project.schedules.forEach((ruleMap, ruleId) => {
        if (ruleMap.get("targetTableId") === tableId) {
            newRules.push({
                id: ruleId,
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

    rules = newRules;
}

const scheduleObserver = () => {
    loadRules();
};

$effect(() => {
    if (store.project) {
        store.project.schedules.observeDeep(scheduleObserver);
        loadRules();

        return () => {
            store.project?.schedules.unobserveDeep(scheduleObserver);
        };
    }
});

function startCreate() {
    currentRuleId = undefined;
    currentRule = undefined;
    isEditing = true;
}

function startEdit(id: string, rule: ScheduleRule) {
    currentRuleId = id;
    currentRule = { ...rule };
    isEditing = true;
}

function cancelEdit() {
    isEditing = false;
    currentRuleId = undefined;
    currentRule = undefined;
}

function saveRule(ruleData: Partial<ScheduleRule> & { sql: string, rrule: string, targetTableId: string }) {
    if (!store.project || !tableId) return;

    if (currentRuleId) {
        updateScheduleRule(store.project, currentRuleId, ruleData);
    } else {
        createScheduleRule(store.project, ruleData);
    }

    isEditing = false;
    currentRuleId = undefined;
    currentRule = undefined;
}

function handleDelete(id: string) {
    if (!store.project) return;
    if (confirm("Are you sure you want to delete this schedule rule?")) {
        deleteScheduleRule(store.project, id);
    }
}
</script>

<div class="table-schedule-panel" data-testid="yjs-table-schedule-panel">
    <div class="header">
        <h3 class="title">Schedule Rules</h3>
        {#if !isEditing}
            <button class="add-btn" data-testid="schedule-rule-add" onclick={startCreate}>
                + New Rule
            </button>
        {/if}
    </div>

    {#if isEditing}
        <ScheduleRuleEditor
            {tableId}
            rule={currentRule}
            onSave={saveRule}
            onCancel={cancelEdit}
        />
    {:else}
        <ScheduleRuleList
            {rules}
            onEdit={startEdit}
            onDelete={handleDelete}
        />
    {/if}
</div>

<style>
.table-schedule-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}
.title {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0;
}
.add-btn {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f9fafb;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 0.8rem;
}
.add-btn:hover {
    background: #f3f4f6;
}
</style>
