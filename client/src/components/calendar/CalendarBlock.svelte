<script lang="ts">
// Entry point of the calendar feature: an embedded block inside an outliner
// item (componentType "calendar"). The item stores only the calendar id; the
// calendar itself is an entry of the project's `calendars` map — unlike a
// table it has no subdoc of its own (docs/crdt-sql-architecture.md §6.6).
//
// The rendered view is wrapped in {#key calendarId}: switching the
// underlying calendar remounts the whole view instead of rebinding observers
// in place (AGENTS.md §11).

import { onDestroy, onMount } from "svelte";
import { Project } from "$shared/app-schema";
import {
    getItemCalendarId,
    observeItemCalendarId,
    setItemCalendarId,
} from "../../services/calendar/calendarBinding";
import { createCalendar, listCalendars, observeCalendars } from "../../services/calendar/calendarService";
import { yjsStore } from "../../stores/yjsStore.svelte";
import CalendarView from "./CalendarView.svelte";
import TableCreationForm from "../yjstable/TableCreationForm.svelte";
import { getTableRegistry, listTables } from "../../services/yjstable/tableDocs";
import { createPresetTable, type TablePreset } from "../../services/yjstable/tablePresets";
import type * as Y from "yjs";

interface ItemLike {
    ydoc: import("yjs").Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

interface Props {
    item: ItemLike;
    isReadOnly?: boolean;
}

let { item, isReadOnly = false }: Props = $props();

let calendarId = $state<string | undefined>();
// Bumped by Yjs observers so the $derived lookup below re-evaluates.
let registryVersion = $state(0);

let newCalendarName = $state("");
let creationMode = $state<"new" | "new-table" | "existing-table" | "existing">("new");
let selectedExistingTableId = $state("");
let error = $state<string | undefined>();
let selectedExistingCalendarId = $state<string | undefined>(undefined);

const project = $derived(Project.fromDoc(item.ydoc));
const existingCalendars = $derived.by(() => {
    void registryVersion;
    return listCalendars(project);
});
const existingTables = $derived.by(() => {
    void registryVersion;
    return listTables(item.ydoc);
});

$effect(() => {
    if (existingTables.length > 0 && !existingTables.some(table => table.tableId === selectedExistingTableId)) {
        selectedExistingTableId = existingTables[0].tableId;
    }
    if (creationMode === "existing" && existingCalendars.length > 0 && !selectedExistingCalendarId) {
        selectedExistingCalendarId = existingCalendars[0].id;
    }
});

const projectId = $derived(yjsStore.currentProjectId ?? undefined);

const registryObserver = () => {
    registryVersion++;
};
let unobserveItem: (() => void) | undefined;
let unobserveRegistry: (() => void) | undefined;

onMount(() => {
    calendarId = getItemCalendarId(item);
    unobserveRegistry = observeCalendars(project, registryObserver);
    getTableRegistry(item.ydoc).observeDeep(registryObserver);
    unobserveItem = observeItemCalendarId(item, () => {
        calendarId = getItemCalendarId(item);
    });
});

onDestroy(() => {
    unobserveRegistry?.();
    unobserveItem?.();
    getTableRegistry(item.ydoc).unobserveDeep(registryObserver);
});

function selectExistingCalendar() {
    if (selectedExistingCalendarId && !isReadOnly) {
        setItemCalendarId(item, selectedExistingCalendarId);
        calendarId = selectedExistingCalendarId;
    }
}

function createNewCalendar() {
    if (isReadOnly) return;
    const name = newCalendarName.trim() || "Calendar";
    const id = createCalendar(project, { name });
    setItemCalendarId(item, id);
    calendarId = id;
}

function placementNode(): Y.Map<unknown> {
    if (isReadOnly) throw new Error("This Calendar placement is read-only.");
    const node = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown> | undefined;
    if (!node || node.get("componentType") !== "calendar" || node.get("calendarId")) {
        throw new Error("The Calendar placement is no longer available for creation.");
    }
    return node;
}

function createCalendarFromPreset(preset: TablePreset, name: string, sqlName: string) {
    placementNode();
    item.ydoc.transact(() => {
        createPresetTable(item.ydoc, preset, name, sqlName);
        const id = createCalendar(project, {
            name: name + " Calendar",
            query: preset.query(sqlName),
            roleTitle: preset.key === "habits" ? "name" : "title",
            roleStart: preset.key === "habits" ? "log_date" : undefined,
            roleDue: preset.key === "tasks" ? "due_date" : undefined,
        });
        setItemCalendarId(item, id);
        calendarId = id;
    });
}

function createCalendarFromExistingTable() {
    try {
        placementNode();
        const table = existingTables.find(entry => entry.tableId === selectedExistingTableId);
        if (!table || !table.sqlName) throw new Error("The selected Table is not available for Calendar queries.");
        item.ydoc.transact(() => {
            if (!getTableRegistry(item.ydoc).has(table.tableId)) {
                throw new Error("The selected Table was deleted.");
            }
            const id = createCalendar(project, {
                name: (table.name || "Table") + " Calendar",
                query: "SELECT * FROM " + table.sqlName,
            });
            setItemCalendarId(item, id);
            calendarId = id;
        });
        error = undefined;
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }
}

</script>

<div
    class="calendar-block"
    data-testid="calendar-block"
    onclick={(e) => e.stopPropagation()}
    onmousedown={(e) => e.stopPropagation()}
    role="presentation"
>
    {#if calendarId}
        {#key calendarId}
            <CalendarView {project} {projectId} {calendarId} />
        {/key}
    {:else}
        <div class="create-panel" data-testid="calendar-create-panel">
            <div class="mode-tabs">
                <button
                    type="button"
                    class="mode-tab"
                    class:active={creationMode === "new"}
                    onclick={() => (creationMode = "new")}
                >New Calendar</button>
                <button
                    type="button"
                    class="mode-tab"
                    class:active={creationMode === "new-table"}
                    onclick={() => (creationMode = "new-table")}
                >New Table and Calendar</button>
                {#if existingTables.length > 0}
                    <button
                        type="button"
                        class="mode-tab"
                        class:active={creationMode === "existing-table"}
                        onclick={() => (creationMode = "existing-table")}
                    >New Calendar over Existing Table</button>
                {/if}
                {#if existingCalendars.length > 0}
                    <button
                        type="button"
                        class="mode-tab"
                        class:active={creationMode === "existing"}
                        onclick={() => (creationMode = "existing")}
                    >Existing Calendar</button>
                {/if}
            </div>

            {#if creationMode === "new"}
                <div class="create-form">
                    <input
                        type="text"
                        placeholder="Calendar name"
                        data-testid="calendar-name-input"
                        value={newCalendarName}
                        oninput={(e) => {
                            newCalendarName = (e.target as HTMLInputElement).value;
                        }}
                    />
                    <button type="button" data-testid="calendar-create" onclick={createNewCalendar} disabled={isReadOnly}>
                        Create
                    </button>
                </div>
            {:else if creationMode === "new-table"}
                {#if isReadOnly}
                    <p role="alert">This location is read-only.</p>
                {:else}
                    <TableCreationForm {existingTables} onCreate={createCalendarFromPreset} buttonLabel="Create Table and Calendar" />
                {/if}
            {:else if creationMode === "existing-table"}
                <div class="create-form">
                    <select
                        aria-label="Existing Table"
                        data-testid="calendar-existing-table-select"
                        bind:value={selectedExistingTableId}
                        disabled={isReadOnly}
                    >
                        {#each existingTables as table (table.tableId)}
                            <option value={table.tableId}>{table.name || "Untitled table"} ({table.sqlName})</option>
                        {/each}
                    </select>
                    <button
                        type="button"
                        data-testid="calendar-create-from-table"
                        onclick={createCalendarFromExistingTable}
                        disabled={isReadOnly || !selectedExistingTableId}
                    >Create Calendar</button>
                </div>
                <p class="hint">Choose title and date roles in Calendar Settings after creation.</p>
            {:else}
                <div class="create-form">
                    <select
                        aria-label="Existing Calendar"
                        data-testid="calendar-existing-select"
                        value={selectedExistingCalendarId}
                        onchange={(e) => {
                            selectedExistingCalendarId = (e.target as HTMLSelectElement).value;
                        }}
                    >
                        {#each existingCalendars as entry (entry.id)}
                            <option value={entry.id}>{entry.settings.name || "Untitled calendar"}</option>
                        {/each}
                    </select>
                    <button type="button" data-testid="calendar-select-existing" onclick={selectExistingCalendar} disabled={isReadOnly}>
                        Select
                    </button>
                </div>
            {/if}
            {#if error}<p role="alert" class="error">{error}</p>{/if}
        </div>
    {/if}
</div>

<style>
.calendar-block {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 8px;
    margin-top: 8px;
    background: white;
}

.create-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mode-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
}

.mode-tab {
    background: none;
    border: none;
    padding: 4px 8px;
    font-size: 0.85rem;
    color: #6b7280;
    cursor: pointer;
    border-radius: 4px;
}

.mode-tab.active {
    color: #111827;
    font-weight: 600;
    background: #e5e7eb;
}

.create-form {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}

.create-form input,
.create-form select {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
}

.hint { font-size: 0.85rem; color: #6b7280; }
.error { color: #991b1b; }
.create-form button {
    border: 1px solid #2563eb;
    border-radius: 4px;
    background: #2563eb;
    color: white;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 0.85rem;
}
</style>
