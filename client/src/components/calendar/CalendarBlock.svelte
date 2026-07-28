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

interface ItemLike {
    ydoc: import("yjs").Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

interface Props {
    item: ItemLike;
}

let { item }: Props = $props();

let calendarId = $state<string | undefined>();
// Bumped by Yjs observers so the $derived lookup below re-evaluates.
let registryVersion = $state(0);

let newCalendarName = $state("");
let creationMode = $state<"new" | "existing">("new");
let selectedExistingCalendarId = $state<string | undefined>(undefined);

const project = $derived(Project.fromDoc(item.ydoc));
const existingCalendars = $derived.by(() => {
    void registryVersion;
    return listCalendars(project);
});

$effect(() => {
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
    unobserveItem = observeItemCalendarId(item, () => {
        calendarId = getItemCalendarId(item);
    });
});

onDestroy(() => {
    unobserveRegistry?.();
    unobserveItem?.();
});

function selectExistingCalendar() {
    if (selectedExistingCalendarId) {
        setItemCalendarId(item, selectedExistingCalendarId);
        calendarId = selectedExistingCalendarId;
    }
}

function createNewCalendar() {
    const name = newCalendarName.trim() || "Calendar";
    const id = createCalendar(project, { name });
    setItemCalendarId(item, id);
    calendarId = id;
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
                    <button type="button" data-testid="calendar-create" onclick={createNewCalendar}>
                        Create
                    </button>
                </div>
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
                    <button type="button" data-testid="calendar-select-existing" onclick={selectExistingCalendar}>
                        Select
                    </button>
                </div>
            {/if}
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
