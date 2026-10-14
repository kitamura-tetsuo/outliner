<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { Project } from "$shared/app-schema";
import { getItemCalendarId, observeItemCalendarId } from "../../services/calendar/calendarBinding";
import { listCalendars, observeCalendars } from "../../services/calendar/calendarService";
import {
    bindExistingCalendar,
    createCalendarOverExistingTable,
    createCalendarWithNewTable,
    createIndependentCalendar,
} from "../../services/calendar/calendarSetup";
import { listTables } from "../../services/yjstable/tableDocs";
import type { TableCreationInput } from "../yjstable/TableCreationForm.svelte";
import TableCreationForm from "../yjstable/TableCreationForm.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import CalendarView from "./CalendarView.svelte";

interface ItemLike { ydoc: import("yjs").Doc; tree: { getNodeValueFromKey: (key: string) => unknown; }; key: string; }
interface Props { item: ItemLike; isReadOnly?: boolean; }
let { item, isReadOnly = false }: Props = $props();
let calendarId = $state<string | undefined>();
let registryVersion = $state(0);
let newCalendarName = $state("");
let creationMode = $state<"new" | "new-table" | "existing-table" | "existing-calendar">("new");
let selectedExistingCalendarId = $state<string | undefined>();
let selectedExistingTableId = $state<string | undefined>();
let selectedExistingTableSqlName = $state<string | undefined>();
let setupError = $state<string | undefined>();
const project = $derived(Project.fromDoc(item.ydoc));
const existingCalendars = $derived.by(() => { void registryVersion; return listCalendars(project); });
const existingTables = $derived.by(() => { void registryVersion; return listTables(item.ydoc); });
const takenSqlNames = $derived(existingTables.map(table => table.sqlName));
const projectId = $derived(yjsStore.currentProjectId ?? undefined);
const authorization = $derived({ projectAccess: Boolean(projectId), surfaceWritable: !isReadOnly });
const registryObserver = () => registryVersion++;
let unobserveItem: (() => void) | undefined;
let unobserveRegistry: (() => void) | undefined;

onMount(() => {
    calendarId = getItemCalendarId(item);
    unobserveRegistry = observeCalendars(project, registryObserver);
    project.tables.observeDeep(registryObserver);
    unobserveItem = observeItemCalendarId(item, () => calendarId = getItemCalendarId(item));
});
onDestroy(() => {
    unobserveRegistry?.();
    project.tables.unobserveDeep(registryObserver);
    unobserveItem?.();
});
function run(action: () => string): string | undefined {
    try { setupError = undefined; calendarId = action(); return undefined; }
    catch (error) { setupError = error instanceof Error ? error.message : String(error); return setupError; }
}
function showExistingCalendar() {
    creationMode = "existing-calendar";
    selectedExistingCalendarId ??= existingCalendars[0]?.id;
    setupError = undefined;
}
function showExistingTable() {
    creationMode = "existing-table";
    selectedExistingTableId ??= existingTables[0]?.tableId;
    selectedExistingTableSqlName = existingTables.find(table => table.tableId === selectedExistingTableId)?.sqlName;
    setupError = undefined;
}
function createFromPreset(input: TableCreationInput): string | undefined {
    let createdId: string | undefined;
    const error = run(() => {
        const result = createCalendarWithNewTable(item, input, authorization);
        createdId = result.calendarId;
        return result.calendarId;
    });
    calendarId = createdId;
    return error;
}
</script>

<div class="calendar-block" data-testid="calendar-block" onclick={e => e.stopPropagation()} onmousedown={e => e.stopPropagation()} role="presentation">
{#if calendarId}
    {#key calendarId}<CalendarView {project} {projectId} {calendarId} />{/key}
{:else}
    <div class="create-panel" data-testid="calendar-create-panel">
        <div class="mode-tabs">
            <button type="button" class:active={creationMode === "new"} onclick={() => creationMode = "new"}>New Calendar</button>
            <button type="button" class:active={creationMode === "new-table"} onclick={() => creationMode = "new-table"}>New Table</button>
            {#if existingTables.length}<button type="button" class:active={creationMode === "existing-table"} onclick={showExistingTable}>New Calendar over Existing Table</button>{/if}
            {#if existingCalendars.length}<button type="button" class:active={creationMode === "existing-calendar"} onclick={showExistingCalendar}>Existing Calendar</button>{/if}
        </div>
        <div hidden={creationMode !== "new-table"}><TableCreationForm {takenSqlNames} oncreate={createFromPreset} /></div>
        {#if creationMode === "new"}
            <div class="create-form"><input placeholder="Calendar name" data-testid="calendar-name-input" bind:value={newCalendarName} /><button type="button" data-testid="calendar-create" onclick={() => run(() => createIndependentCalendar(item, newCalendarName, authorization))}>Create</button></div>
        {:else if creationMode === "existing-table"}
            <div class="create-form">
                <input placeholder="Calendar name" data-testid="calendar-table-name-input" bind:value={newCalendarName} />
                <select aria-label="Existing Table" data-testid="calendar-existing-table-select" value={selectedExistingTableId} onchange={e => { selectedExistingTableId = e.currentTarget.value; selectedExistingTableSqlName = existingTables.find(t => t.tableId === selectedExistingTableId)?.sqlName; setupError = undefined; }}>
                    {#each existingTables as table (table.tableId)}<option value={table.tableId}>{table.name} ({table.sqlName})</option>{/each}
                </select>
                <button type="button" data-testid="calendar-create-over-table" onclick={() => selectedExistingTableId && selectedExistingTableSqlName && run(() => createCalendarOverExistingTable(item, { tableId: selectedExistingTableId!, sqlName: selectedExistingTableSqlName! }, newCalendarName, authorization))}>Create</button>
            </div>
        {:else if creationMode === "existing-calendar"}
            <div class="create-form"><select aria-label="Existing Calendar" data-testid="calendar-existing-select" bind:value={selectedExistingCalendarId}>{#each existingCalendars as entry (entry.id)}<option value={entry.id}>{entry.settings.name || "Untitled calendar"}</option>{/each}</select><button type="button" data-testid="calendar-select-existing" onclick={() => selectedExistingCalendarId && run(() => bindExistingCalendar(item, selectedExistingCalendarId!, authorization))}>Select</button></div>
        {/if}
        {#if setupError}<p class="create-error" data-testid="calendar-setup-error">{setupError}</p>{/if}
    </div>
{/if}
</div>

<style>
.calendar-block { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; margin-top: 8px; background: white; }
.create-panel { display: flex; flex-direction: column; gap: 6px; }
.mode-tabs, .create-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.mode-tabs { margin-bottom: 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
.mode-tabs button { background: none; border: none; padding: 4px 8px; font-size: .85rem; color: #6b7280; cursor: pointer; border-radius: 4px; }
.mode-tabs button.active { color: #111827; font-weight: 600; background: #e5e7eb; }
.create-form input, .create-form select { border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 6px; font-size: .85rem; }
.create-form button { border: 1px solid #2563eb; border-radius: 4px; background: #2563eb; color: white; padding: 4px 12px; cursor: pointer; font-size: .85rem; }
.create-error { font-size: .8rem; color: #dc2626; margin: 0; }
</style>
