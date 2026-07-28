<script lang="ts">
// Structured (form) editor for a calendar's role assignment: which result
// column plays the title/start/all-day/duration role, and which columns are
// group axes. Mirrors TableUiDefEditor.svelte's shape: every input writes
// only its own key, through updateCalendar, so concurrent edits merge
// cleanly and nothing here ever prunes an assignment on its own (only an
// explicit user pick changes a role/group-axis value).
//
// Candidates are the query's *result* columns, in result order, not a
// schema's columns (docs/crdt-sql-architecture.md §6.3) — `resultColumns` is
// supplied by the parent from the latest query result. `mergeCandidates`
// keeps a currently assigned column visible even when the latest result
// temporarily does not carry it, so nothing is silently dropped.

import type { Project } from "$shared/app-schema";
import { mergeCandidates } from "../../services/calendar/calendarRoleCandidates";
import { updateCalendar } from "../../services/calendar/calendarService";

interface RoleAssignment {
    roleTitle?: string;
    roleStart?: string;
    roleAllDay?: string;
    roleDuration?: string;
    roleDue?: string;
    groupAxes: string[];
}

interface Props {
    project: Project;
    calendarId: string;
    resultColumns: string[];
    roles: RoleAssignment;
    readOnly: boolean;
    readOnlyReason?: string;
}

let { project, calendarId, resultColumns, roles, readOnly, readOnlyReason }: Props = $props();

const ROLE_FIELDS: { key: "roleTitle" | "roleStart" | "roleAllDay" | "roleDuration" | "roleDue"; label: string; }[] = [
    { key: "roleTitle", label: "Title" },
    { key: "roleStart", label: "Start" },
    { key: "roleAllDay", label: "All-day" },
    { key: "roleDuration", label: "Duration" },
    { key: "roleDue", label: "Due" },
];

const titleCandidates = $derived(mergeCandidates(resultColumns, [roles.roleTitle]));
const startCandidates = $derived(mergeCandidates(resultColumns, [roles.roleStart]));
const allDayCandidates = $derived(mergeCandidates(resultColumns, [roles.roleAllDay]));
const durationCandidates = $derived(mergeCandidates(resultColumns, [roles.roleDuration]));
const dueCandidates = $derived(mergeCandidates(resultColumns, [roles.roleDue]));
const candidatesByRole = $derived({
    roleTitle: titleCandidates,
    roleStart: startCandidates,
    roleAllDay: allDayCandidates,
    roleDuration: durationCandidates,
    roleDue: dueCandidates,
});
const groupAxisCandidates = $derived(mergeCandidates(resultColumns, roles.groupAxes));

function setRole(key: "roleTitle" | "roleStart" | "roleAllDay" | "roleDuration" | "roleDue", value: string) {
    updateCalendar(project, calendarId, { [key]: value === "" ? undefined : value });
}

function toggleGroupAxis(column: string, checked: boolean) {
    const next = checked ? [...roles.groupAxes, column] : roles.groupAxes.filter((c) => c !== column);
    updateCalendar(project, calendarId, { groupAxes: next });
}
</script>

<div class="calendar-role-editor" data-testid="calendar-role-editor">
    {#if readOnly}
        <p class="read-only-banner" data-testid="calendar-read-only-banner">{readOnlyReason}</p>
    {/if}

    <p class="editor-label">Role assignment</p>
    <div class="role-rows">
        {#each ROLE_FIELDS as field (field.key)}
            <div class="role-row">
                <span class="role-label">{field.label}</span>
                <select
                    data-testid={`calendar-role-${field.key}`}
                    value={roles[field.key] ?? ""}
                    onchange={(e) => setRole(field.key, (e.target as HTMLSelectElement).value)}
                >
                    <option value="">(none)</option>
                    {#each candidatesByRole[field.key] as column (column)}
                        <option value={column}>
                            {column}{resultColumns.includes(column) ? "" : " (not in current result)"}
                        </option>
                    {/each}
                </select>
            </div>
        {/each}
    </div>

    <p class="editor-label">Group axes</p>
    {#if groupAxisCandidates.length === 0}
        <p class="hint">Run a query that returns at least one column to choose a grouping axis.</p>
    {:else}
        <div class="group-axes" data-testid="calendar-group-axes">
            {#each groupAxisCandidates as column (column)}
                <label class="group-axis-option">
                    <input
                        type="checkbox"
                        data-testid={`calendar-group-axis-${column}`}
                        checked={roles.groupAxes.includes(column)}
                        onchange={(e) => toggleGroupAxis(column, (e.target as HTMLInputElement).checked)}
                    />
                    {column}{resultColumns.includes(column) ? "" : " (not in current result)"}
                </label>
            {/each}
        </div>
    {/if}
</div>

<style>
.calendar-role-editor {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.read-only-banner {
    background: #fef3c7;
    border: 1px solid #fcd34d;
    color: #92400e;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 0.8rem;
    margin: 0 0 4px;
}

.editor-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    margin: 4px 0 0;
}

.role-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.role-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
}

.role-label {
    min-width: 6rem;
}

select {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
    background: white;
}

.group-axes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.group-axis-option {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
}

.hint {
    color: #6b7280;
    font-size: 0.8rem;
    margin: 0;
}
</style>
