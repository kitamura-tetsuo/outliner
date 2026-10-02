<script lang="ts">
// The delete prompt for a calendar entry (#4349): never silently destructive.
// The prompt appears on every delete — there is no "don't ask again", and
// nothing here persists a skip preference anywhere.
//
// A materialized recurrence override (`isRecurrenceOverrideEntry`) only
// offers "delete this occurrence": deleting it any other way would either
// leave a stray item (clear-projected-field) or delete the override without
// recording the exception that keeps the virtual occurrence from
// reappearing once it is ever regenerated (delete-source) — so the correct
// action is the only one shown, per the "never offer an affordance that
// doesn't do the right thing" rule this feature otherwise follows.

import type { Project } from "$shared/app-schema";
import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import { deleteCalendarEntry, deleteCalendarRecurrenceOccurrence, isRecurrenceOverrideEntry } from "../../services/calendar/calendarEntryDelete";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";

interface Props {
    project: Project;
    resolver: RelationResolver;
    entry: CalendarEntry;
    onDeleted: () => void;
    onCancel: () => void;
}

let { project, resolver, entry, onDeleted, onCancel }: Props = $props();

let error = $state<string | undefined>(undefined);
let busy = $state(false);

// svelte-ignore state_referenced_locally
const isOccurrence = isRecurrenceOverrideEntry(entry);

async function run(action: () => Promise<void> | void) {
    busy = true;
    error = undefined;
    try {
        await action();
        onDeleted();
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
    } finally {
        busy = false;
    }
}

let dialogElement: HTMLDialogElement | undefined = $state();

$effect(() => {
    if (dialogElement) {
        if (!dialogElement.open && typeof dialogElement.showModal === "function") {
            dialogElement.showModal();
        }
    }
    return () => {
        if (dialogElement && dialogElement.open && typeof dialogElement.close === "function") {
            dialogElement.close();
        }
    };
});
</script>

<dialog
    bind:this={dialogElement}
    class="calendar-delete-dialog"
    role="alertdialog"
    aria-modal="true"
    aria-label="Delete calendar entry"
    data-testid="calendar-delete-dialog"
    oncancel={(e) => { e.preventDefault(); onCancel(); }}
    onclick={(e) => { if (e.target === dialogElement) onCancel(); }}
>
    <div class="dialog-content" role="document">
        <h3>Delete "{entry.title || "this entry"}"?</h3>

        {#if isOccurrence}
            <p>This entry is one occurrence of a recurring plan.</p>
            <div class="actions">
                <button type="button" data-testid="calendar-delete-cancel" onclick={onCancel} disabled={busy}>Cancel</button>
                <button
                    type="button"
                    class="destructive"
                    data-testid="calendar-delete-occurrence"
                    disabled={busy}
                    onclick={() => run(() => deleteCalendarRecurrenceOccurrence(project, entry))}
                >
                    Delete this occurrence
                </button>
            </div>
        {:else}
            <p>Remove the item entirely, or just clear its date so it leaves the calendar?</p>
            <div class="actions">
                <button type="button" data-testid="calendar-delete-cancel" onclick={onCancel} disabled={busy}>Cancel</button>
                <button
                    type="button"
                    data-testid="calendar-delete-clear-field"
                    disabled={busy}
                    onclick={() => run(() => deleteCalendarEntry(resolver, entry, "clear-projected-field"))}
                >
                    Clear date only
                </button>
                <button
                    type="button"
                    class="destructive"
                    data-testid="calendar-delete-source"
                    disabled={busy}
                    onclick={() => run(() => deleteCalendarEntry(resolver, entry, "delete-source"))}
                >
                    Delete item
                </button>
            </div>
        {/if}

        {#if error}
            <p class="error" data-testid="calendar-delete-error">{error}</p>
        {/if}
    </div>
</dialog>

<style>
.calendar-delete-dialog {
    background: white;
    border-radius: 8px;
    border: none;
    padding: 16px 20px;
    width: 340px;
    max-width: 90vw;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.calendar-delete-dialog::backdrop {
    background: rgba(17, 24, 39, 0.4);
}

.calendar-delete-dialog h3 {
    margin: 0 0 8px;
    font-size: 1rem;
}

.calendar-delete-dialog p {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: #374151;
}

.error {
    color: #dc2626;
    font-size: 0.8rem;
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
}

.actions button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 0.85rem;
}

.actions button.destructive {
    background: #dc2626;
    color: white;
    border-color: #dc2626;
}

.actions button:disabled {
    opacity: 0.6;
    cursor: default;
}
</style>
