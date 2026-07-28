<script lang="ts">
// Orchestrates one calendar: owns the query-execution session, keeps a plain
// $state mirror of the calendar's Y.Map (AGENTS.md §11 mirror pattern), and
// hosts the role-assignment editor. Rendered by both the embedded block and
// the standalone route (docs/crdt-sql-architecture.md §6.6), so they always
// show the same calendar.
//
// This component is always mounted under {#key calendarId} (see
// CalendarBlock/the standalone route) — a calendar has no subdoc to key on
// the way a table does, so the id itself is the remount key.
//
// The day/week/month/Gantt grid views are a separate, later piece of work
// (#4347/#4350); this view renders a plain preview of the query result so
// the role assignment is visible without waiting on that grid.

import { onDestroy, onMount } from "svelte";
import type { Project } from "$shared/app-schema";
import * as Y from "yjs";
import { analyzeCalendarEditability } from "../../services/calendar/calendarEditability";
import { runCalendarQuery } from "../../services/calendar/calendarQueryRunner";
import {
    type CalendarSettings,
    DEFAULT_CALENDAR_VIEW_TYPE,
    destroyCalendarUndoManager,
    ensureCalendarUndoManager,
    getCalendarMap,
    updateCalendar,
} from "../../services/calendar/calendarService";
import { globalUndoRouter } from "../../services/undo/undoRouter";
import { projectSchemaName } from "../../services/yjstable/sqlNames";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import { REQUERY_DEBOUNCE_MS, type TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import CalendarRoleEditor from "./CalendarRoleEditor.svelte";

interface Props {
    project: Project;
    projectId?: string;
    calendarId: string;
}

let { project, projectId, calendarId }: Props = $props();

const EMPTY_SETTINGS: CalendarSettings = {
    name: "",
    query: "",
    viewType: DEFAULT_CALENDAR_VIEW_TYPE,
    groupAxes: [],
};

let settings = $state<CalendarSettings>(EMPTY_SETTINGS);
let queryInput = $state("");
let result = $state<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>(undefined);

const editability = $derived(analyzeCalendarEditability(result.columns));

function readSettingsFromMap(): CalendarSettings | undefined {
    const map = getCalendarMap(project, calendarId);
    if (!map) return undefined;
    const groupAxesValue = map.get("groupAxes");
    return {
        name: String(map.get("name") ?? ""),
        query: String(map.get("query") ?? ""),
        viewType: String(map.get("viewType") ?? DEFAULT_CALENDAR_VIEW_TYPE),
        timezone: map.get("timezone") as string | undefined,
        roleTitle: map.get("roleTitle") as string | undefined,
        roleStart: map.get("roleStart") as string | undefined,
        roleAllDay: map.get("roleAllDay") as string | undefined,
        roleDuration: map.get("roleDuration") as string | undefined,
        groupAxes: groupAxesValue instanceof Y.Array ? groupAxesValue.toArray() : [],
    };
}

let requeryTimer: ReturnType<typeof setTimeout> | undefined;
// project/projectId/calendarId are static within the component lifecycle due
// to `{#key}` (a prop change remounts the whole view, per AGENTS.md §11).
// svelte-ignore state_referenced_locally
const pgSchema = projectSchemaName(projectId);
// svelte-ignore state_referenced_locally
const session = createTableEngineSession({ projectDoc: project.ydoc, projectId });

async function runQuery() {
    const outcome = await runCalendarQuery(session, pgSchema, settings.query);
    if (outcome.result) {
        result = outcome.result;
        queryError = undefined;
    } else {
        queryError = outcome.error;
    }
}

function scheduleRequery() {
    if (requeryTimer !== undefined) clearTimeout(requeryTimer);
    requeryTimer = setTimeout(() => {
        requeryTimer = undefined;
        void runQuery();
    }, REQUERY_DEBOUNCE_MS);
}

function refreshMirror() {
    const next = readSettingsFromMap();
    if (!next) return;
    const queryChanged = next.query !== settings.query;
    settings = next;
    queryInput = next.query;
    if (queryChanged) scheduleRequery();
}

const mirrorObserver = () => refreshMirror();

function commitQuery(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    updateCalendar(project, calendarId, { query: value });
}

onMount(() => {
    ensureCalendarUndoManager(project);
    refreshMirror();
    void runQuery();
    const map = getCalendarMap(project, calendarId);
    map?.observeDeep(mirrorObserver);
});

onDestroy(() => {
    if (requeryTimer !== undefined) clearTimeout(requeryTimer);
    const map = getCalendarMap(project, calendarId);
    map?.unobserveDeep(mirrorObserver);
    session.dispose();
    destroyCalendarUndoManager(project.ydoc);
});
</script>

<div class="calendar-view" data-testid="calendar-view">
    <div class="view-toolbar">
        <span class="calendar-name" data-testid="calendar-name">{settings.name}</span>
        <div class="undo-controls">
            <button type="button" data-testid="calendar-undo" onclick={() => globalUndoRouter.undo()}>Undo</button>
            <button type="button" data-testid="calendar-redo" onclick={() => globalUndoRouter.redo()}>Redo</button>
        </div>
    </div>

    <label class="editor-label" for="calendar-query-input">Query (SELECT)</label>
    <input
        id="calendar-query-input"
        data-testid="calendar-query-input"
        type="text"
        spellcheck="false"
        value={queryInput}
        onchange={commitQuery}
    />

    {#if queryError}
        <p class="error" data-testid="calendar-query-error">{queryError}</p>
    {/if}

    <CalendarRoleEditor
        {project}
        {calendarId}
        resultColumns={result.columns}
        roles={{
            roleTitle: settings.roleTitle,
            roleStart: settings.roleStart,
            roleAllDay: settings.roleAllDay,
            roleDuration: settings.roleDuration,
            groupAxes: settings.groupAxes,
        }}
        readOnly={!editability.editable}
        readOnlyReason={editability.readOnlyReason}
    />

    <p class="editor-label">Preview (day/week/month/Gantt grid views are a later feature)</p>
    {#if result.rows.length === 0}
        <p class="hint">No entries yet.</p>
    {:else}
        <table class="preview-table" data-testid="calendar-preview-table">
            <thead>
                <tr>
                    {#each result.columns as column (column)}
                        <th>{column}</th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each result.rows as row, i (i)}
                    <tr>
                        {#each result.columns as column (column)}
                            <td>{String(row[column] ?? "")}</td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</div>

<style>
.calendar-view {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
}

.view-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.calendar-name {
    font-weight: 600;
    color: #111827;
}

.undo-controls {
    display: flex;
    gap: 4px;
}

.undo-controls button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 2px 10px;
    cursor: pointer;
    font-size: 0.8rem;
}

.editor-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    margin: 4px 0 0;
}

input {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
    background: white;
}

.error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
}

.hint {
    color: #6b7280;
    font-size: 0.8rem;
    margin: 0;
}

.preview-table {
    border-collapse: collapse;
    font-size: 0.8rem;
    width: 100%;
}

.preview-table th,
.preview-table td {
    border: 1px solid #e5e7eb;
    padding: 2px 6px;
    text-align: left;
}
</style>
