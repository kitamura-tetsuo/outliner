<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { store } from "../../stores/store.svelte";
    import ScheduleRuleList from "../schedule/ScheduleRuleList.svelte";
    import ScheduleRuleEditor from "../schedule/ScheduleRuleEditor.svelte";
    import { createScheduleRule, deleteScheduleRule, updateScheduleRule, type ScheduleRule } from "../../services/schedule/scheduleRuleService";

    interface Props {
        tableId: string;
    }

    let { tableId }: Props = $props();

    let rules = $state<{ id: string, rule: ScheduleRule }[]>([]);
    let isEditing = $state(false);
    let currentRuleId: string | undefined = $state(undefined);
    let currentRule: Partial<ScheduleRule> | undefined = $state(undefined);

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
                        lastRunStatus: ruleMap.get("lastRunStatus") as "ok" | "error" | undefined,
                        lastRunError: ruleMap.get("lastRunError") as string | undefined,
                        completedAt: ruleMap.get("completedAt") as string | undefined,
                        validationError: ruleMap.get("validationError") as string | undefined,
                    }
                });
            }
        });

        rules = newRules;
    }

    let unobserve: (() => void) | undefined;

    onMount(() => {
        if (store.project) {
            const observer = () => loadRules();
            store.project.schedules.observeDeep(observer);
            unobserve = () => {
                store.project?.schedules.unobserveDeep(observer);
            };
            loadRules();
        }
    });

    onDestroy(() => {
        unobserve?.();
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
    <div class="panel-header">
        <h3 class="panel-title">Schedule Rules</h3>
        {#if !isEditing}
            <button class="create-btn" onclick={startCreate} data-testid="yjs-table-schedule-create">
                + New Rule
            </button>
        {/if}
    </div>

    <div class="panel-content">
        {#if !store.project}
            <p class="text-gray-500">Project not loaded.</p>
        {:else if isEditing}
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
</div>

<style>
.table-schedule-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.panel-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
}
.create-btn {
    padding: 4px 12px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
}
.create-btn:hover {
    background: #1d4ed8;
}
</style>
