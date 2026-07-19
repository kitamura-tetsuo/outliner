<script lang="ts">
import { setRuleValue, deleteRule, type TableHandles } from "../../services/yjstable/tableDocs";
import { SvelteMap } from "svelte/reactivity";
import ScheduleRuleEditor from "./ScheduleRuleEditor.svelte";

interface Props {
    handles: TableHandles;
}

let { handles }: Props = $props();

const rulesMap = new SvelteMap<string, { id: string; name: string; statement: string; rrule: string; enabled: boolean }>();

function updateRulesMap() {
    rulesMap.clear();
    handles.rules.forEach((rule, id) => {
        rulesMap.set(id, {
            id,
            name: String(rule.get("name") || ""),
            statement: String(rule.get("statement") || ""),
            rrule: String(rule.get("rrule") || ""),
            enabled: Boolean(rule.get("enabled")),
        });
    });
}

$effect(() => {
    updateRulesMap();
    const observer = () => updateRulesMap();
    handles.rules.observeDeep(observer);
    return () => handles.rules.unobserveDeep(observer);
});
</script>

<div class="table-schedule-panel" data-testid="table-schedule-panel">
    <div class="rules-list">
        <h3>Schedule Rules</h3>
        {#if rulesMap.size === 0}
            <p class="empty">No rules configured for this table.</p>
        {:else}
            <ul>
                {#each [...rulesMap.values()] as rule (rule.id)}
                    <li class="rule-item" data-testid="schedule-rule-item">
                        <div class="rule-header">
                            <span class="rule-name">{rule.name}</span>
                            <label class="toggle">
                                <input type="checkbox" checked={rule.enabled} onchange={(e) => setRuleValue(handles, rule.id, "enabled", e.currentTarget.checked)} />
                                Enabled
                            </label>
                            <button class="delete-btn" onclick={() => deleteRule(handles, rule.id)}>Delete</button>
                        </div>
                        <div class="rule-details">
                            <span class="rrule" title={rule.rrule}>{rule.rrule}</span>
                            <code class="sql">{rule.statement}</code>
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>

    <div class="editor-section">
        <ScheduleRuleEditor {handles} />
    </div>
</div>

<style>
.table-schedule-panel {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.rules-list h3 {
    margin: 0 0 12px 0;
    font-size: 1.1rem;
    color: #111827;
}

.empty {
    color: #6b7280;
    font-style: italic;
}

ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.rule-item {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px;
    background: white;
}

.rule-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
}

.rule-name {
    font-weight: 600;
    flex: 1;
}

.toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
}

.delete-btn {
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 4px 8px;
}

.delete-btn:hover {
    text-decoration: underline;
}

.rule-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
}

.rrule {
    color: #4b5563;
    font-family: monospace;
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
    align-self: flex-start;
}

.sql {
    display: block;
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    margin: 0;
}
</style>
