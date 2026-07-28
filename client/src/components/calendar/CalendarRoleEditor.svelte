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
import {
    VIEW_RANGE_END_SETTING,
    VIEW_RANGE_START_SETTING,
    queryReferencesViewRange,
} from "../../services/calendar/calendarViewRange";

interface RoleAssignment {
    roleTitle?: string;
    roleStart?: string;
    roleAllDay?: string;
    roleDuration?: string;
    roleDue?: string;
    groupAxes: string[];
    laneOrder: string[];
    showEmptyLanes?: boolean;
}

interface Props {
    project: Project;
    calendarId: string;
    /** The calendar's own query text, used only for the range-reference warning below. */
    query?: string;
    resultColumns: string[];
    roles: RoleAssignment;
    readOnly: boolean;
    readOnlyReason?: string;
    /**
     * Distinct values the first group axis currently carries, from the latest
     * query result — the lane-order list mixes these with `roles.laneOrder`
     * so a value can be reordered before or after it has actually appeared
     * (docs/crdt-sql-architecture.md §6.3: lane order is configured, not
     * inferred).
     */
    knownLaneValues?: string[];
}

let {
    project,
    calendarId,
    query = "",
    resultColumns,
    roles,
    readOnly,
    readOnlyReason,
    knownLaneValues = [],
}: Props = $props();

// A query that never reads the injected window (§6.4) silently takes the
// slow path — it filters nothing, so it re-reads every matching row on every
// navigation. This is a warning, not an error: the query still runs, and a
// small table or a query that genuinely wants everything is a legitimate
// choice. Detection is textual and deliberately shallow, per
// `queryReferencesViewRange`.
const showRangeWarning = $derived(query.trim() !== "" && !queryReferencesViewRange(query));

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

// The lane-order list mixes the explicitly configured order with any value
// currently seen but not yet ordered (appended after, like `mergeCandidates`)
// so a value the user has never touched is still visible and reorderable.
const laneOrderDisplay = $derived([
    ...roles.laneOrder,
    ...knownLaneValues.filter((v) => !roles.laneOrder.includes(v)),
]);

function moveLane(value: string, direction: -1 | 1) {
    const index = laneOrderDisplay.indexOf(value);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= laneOrderDisplay.length) return;
    const next = [...laneOrderDisplay];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateCalendar(project, calendarId, { laneOrder: next });
}

function setShowEmptyLanes(value: boolean) {
    updateCalendar(project, calendarId, { showEmptyLanes: value });
}
</script>

<div class="calendar-role-editor" data-testid="calendar-role-editor">
    {#if readOnly}
        <p class="read-only-banner" data-testid="calendar-read-only-banner">{readOnlyReason}</p>
    {/if}

    {#if showRangeWarning}
        <p class="range-warning-banner" data-testid="calendar-range-warning">
            This query does not reference "{VIEW_RANGE_START_SETTING}" or "{VIEW_RANGE_END_SETTING}", so it reads
            every matching row instead of just what is on screen. Add an overlap predicate, e.g.
            <code>start_at &lt; current_setting('{VIEW_RANGE_END_SETTING}')::timestamptz AND start_at + duration
            &gt; current_setting('{VIEW_RANGE_START_SETTING}')::timestamptz</code>.
        </p>
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

        <p class="editor-label">Lane order</p>
        {#if laneOrderDisplay.length === 0}
            <p class="hint">No lane values seen yet — lanes appear here once the query returns some.</p>
        {:else}
            <ul class="lane-order-list" data-testid="calendar-lane-order">
                {#each laneOrderDisplay as value, index (value)}
                    <li class="lane-order-row">
                        <span>{value}</span>
                        <button
                            type="button"
                            data-testid={`calendar-lane-order-up-${value}`}
                            disabled={index === 0}
                            onclick={() => moveLane(value, -1)}
                        >↑</button>
                        <button
                            type="button"
                            data-testid={`calendar-lane-order-down-${value}`}
                            disabled={index === laneOrderDisplay.length - 1}
                            onclick={() => moveLane(value, 1)}
                        >↓</button>
                    </li>
                {/each}
            </ul>
        {/if}

        <label class="show-empty-toggle">
            <input
                type="checkbox"
                data-testid="calendar-show-empty-lanes"
                checked={roles.showEmptyLanes ?? false}
                onchange={(e) => setShowEmptyLanes((e.target as HTMLInputElement).checked)}
            />
            Show empty lanes
        </label>
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

.range-warning-banner {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e40af;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 0.8rem;
    margin: 0 0 4px;
}

.range-warning-banner code {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 2px;
    padding: 0 2px;
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

.lane-order-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
}

.lane-order-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
}

.lane-order-row button {
    border: 1px solid #d1d5db;
    border-radius: 3px;
    background: white;
    font-size: 0.7rem;
    padding: 0 4px;
    cursor: pointer;
}

.lane-order-row button:disabled {
    opacity: 0.4;
    cursor: default;
}

.show-empty-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    margin-top: 4px;
}

.hint {
    color: #6b7280;
    font-size: 0.8rem;
    margin: 0;
}
</style>
