<script lang="ts">
// Creating a calendar entry always creates a new outline item, and there is
// no implicit inbox (#4349): the destination (which item the new item is
// created under) is chosen explicitly every time, with previously used
// destinations offered first. Cancelling this dialog creates nothing —
// `createCalendarEntry` (the only path that writes anything) is only called
// from `submit()`.
//
// The destination history is per-user, per-project local storage
// (`calendarDestinationHistory.ts`), never the project doc: it is
// convenience for one person's habits, not shared truth.

import { onMount } from "svelte";
import type { Project } from "$shared/app-schema";
import {
    floatingDateToUtcMs,
    formatWallTime,
    parseWallTime,
    utcMsToFloatingDate,
    utcMsToWallTime,
    wallTimeToUtcMs,
} from "$shared/utils/zonedTime";
import { isDestinationResolvable, listDestinationCandidates } from "../../services/calendar/calendarDestinationCandidates";
import {
    type CalendarDestinationHistoryEntry,
    pruneUnresolvableDestinations,
    recordDestination,
} from "../../services/calendar/calendarDestinationHistory";
import { createCalendarEntry } from "../../services/calendar/calendarEntryCreate";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";

interface Props {
    project: Project;
    projectId: string;
    resolver: RelationResolver;
    /** Prefills the start field — e.g. the day/slot the user clicked. */
    defaultStartMs?: number;
    defaultAllDay?: boolean;
    /**
     * The calendar's timezone (§6.5). Every field here is a wall-clock
     * reading in it — the day the user clicked is the day they see on the
     * grid, not the day the runtime's own zone (or UTC) happens to be on.
     */
    timeZone: string;
    onCreated: () => void;
    onCancel: () => void;
}

let { project, projectId, resolver, defaultStartMs, defaultAllDay = false, timeZone, onCreated, onCancel }: Props =
    $props();

function toDateInputValue(ms: number): string {
    return utcMsToFloatingDate(ms, timeZone);
}
function toDateTimeInputValue(ms: number): string {
    // `datetime-local` takes minutes precision; the seconds `formatWallTime`
    // emits would be rejected by the input.
    return formatWallTime(utcMsToWallTime(ms, timeZone)).slice(0, 16);
}

let title = $state("");
// svelte-ignore state_referenced_locally
let allDay = $state(defaultAllDay);
// svelte-ignore state_referenced_locally
let startValue = $state(
    defaultStartMs !== undefined
        ? (defaultAllDay ? toDateInputValue(defaultStartMs) : toDateTimeInputValue(defaultStartMs))
        : "",
);
let dueValue = $state("");
let parentKey = $state("");
let error = $state<string | undefined>(undefined);
let submitting = $state(false);
let dialogEl: HTMLDivElement | undefined = $state();

// svelte-ignore state_referenced_locally
const candidates = listDestinationCandidates(project);
let history = $state<CalendarDestinationHistoryEntry[]>([]);

onMount(() => {
    history = pruneUnresolvableDestinations(projectId, (key) => isDestinationResolvable(project, key));
    dialogEl?.querySelector<HTMLElement>("input, select")?.focus();
});

function toggleAllDay(next: boolean) {
    allDay = next;
    // Reformat whatever the user already typed rather than discarding it.
    if (startValue) {
        const ms = parseStartInput(startValue, !next);
        if (ms !== undefined) startValue = next ? toDateInputValue(ms) : toDateTimeInputValue(ms);
    }
}

function parseStartInput(value: string, wasAllDay: boolean): number | undefined {
    if (!value) return undefined;
    if (wasAllDay) return floatingDateToUtcMs(value, timeZone);
    // A `datetime-local` value is a wall-clock reading with no zone of its
    // own; it is the calendar's zone that gives it one.
    const wall = parseWallTime(value.length === 16 ? `${value}:00` : value);
    return wall ? wallTimeToUtcMs(wall, timeZone) : undefined;
}

async function submit(e: Event) {
    e.preventDefault();
    if (!parentKey) {
        error = "Choose a destination before creating an entry.";
        return;
    }
    submitting = true;
    error = undefined;
    try {
        const startMs = parseStartInput(startValue, allDay);
        const dueMs = dueValue ? floatingDateToUtcMs(dueValue, timeZone) : undefined;
        await createCalendarEntry(resolver, { parentKey }, {
            title: title.trim(),
            allDay,
            startMs,
            dueMs,
            timeZone,
        });
        const chosen = candidates.find((c) => c.parentKey === parentKey) ?? history.find((h) => h.parentKey === parentKey);
        if (chosen) recordDestination(projectId, chosen);
        onCreated();
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
    } finally {
        submitting = false;
    }
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
    }
}
</script>

<div
    class="dialog-backdrop"
    role="presentation"
    onkeydown={onKeydown}
>
    <div
        class="dialog"
        role="dialog" tabindex="-1"
        aria-modal="true"
        aria-label="New calendar entry"
        data-testid="calendar-create-dialog"
        bind:this={dialogEl}
    >
        <h3>New entry</h3>
        <form onsubmit={submit}>
            <label class="field">
                <span>Title</span>
                <input
                    type="text"
                    data-testid="calendar-create-title-input"
                    bind:value={title}
                />
            </label>

            <label class="field checkbox">
                <input
                    type="checkbox"
                    data-testid="calendar-create-all-day-checkbox"
                    checked={allDay}
                    onchange={(e) => toggleAllDay((e.target as HTMLInputElement).checked)}
                />
                <span>All day</span>
            </label>

            <label class="field">
                <span>Start (optional)</span>
                {#if allDay}
                    <input
                        type="date"
                        data-testid="calendar-create-start-input"
                        bind:value={startValue}
                    />
                {:else}
                    <input
                        type="datetime-local"
                        data-testid="calendar-create-start-input"
                        bind:value={startValue}
                    />
                {/if}
            </label>

            <label class="field">
                <span>Due (optional)</span>
                <input
                    type="date"
                    data-testid="calendar-create-due-input"
                    bind:value={dueValue}
                />
            </label>

            <label class="field">
                <span>Destination</span>
                <select data-testid="calendar-create-destination-select" bind:value={parentKey}>
                    <option value="" disabled>Choose a page…</option>
                    {#if history.length > 0}
                        <optgroup label="Recent">
                            {#each history as h (h.parentKey)}
                                <option value={h.parentKey} data-testid={`calendar-create-destination-recent-${h.parentKey}`}>
                                    {h.label}
                                </option>
                            {/each}
                        </optgroup>
                    {/if}
                    <optgroup label="All pages">
                        {#each candidates as c (c.parentKey)}
                            <option value={c.parentKey} data-testid={`calendar-create-destination-option-${c.parentKey}`}>
                                {c.label}
                            </option>
                        {/each}
                    </optgroup>
                </select>
            </label>

            {#if error}
                <p class="error" data-testid="calendar-create-error">{error}</p>
            {/if}

            <div class="actions">
                <button type="button" data-testid="calendar-create-cancel" onclick={onCancel}>Cancel</button>
                <button
                    type="submit"
                    data-testid="calendar-create-submit"
                    disabled={submitting || !parentKey}
                >
                    Create
                </button>
            </div>
        </form>
    </div>
</div>

<style>
.dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
}

.dialog {
    background: white;
    border-radius: 8px;
    padding: 16px 20px;
    width: 320px;
    max-width: 90vw;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.dialog h3 {
    margin: 0 0 12px;
    font-size: 1rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
    font-size: 0.8rem;
    color: #374151;
}

.field.checkbox {
    flex-direction: row;
    align-items: center;
    gap: 6px;
}

.field input,
.field select {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
}

.error {
    color: #dc2626;
    font-size: 0.8rem;
    margin: 4px 0;
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
}

.actions button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 0.85rem;
}

.actions button[type="submit"] {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
}

.actions button[type="submit"]:disabled {
    background: #9ca3af;
    border-color: #9ca3af;
    cursor: default;
}
</style>
