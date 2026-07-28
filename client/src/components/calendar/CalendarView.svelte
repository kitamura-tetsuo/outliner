<script lang="ts">
// Orchestrates one calendar: owns the query-execution session, keeps a plain
// $state mirror of the calendar's Y.Map (AGENTS.md §11 mirror pattern), hosts
// the role-assignment editor, and renders the day/multi-day/week/month grid
// views over the query result (#4347; Gantt is #4350, still a later piece).
//
// This component is always mounted under {#key calendarId} (see
// CalendarBlock/the standalone route) — a calendar has no subdoc to key on
// the way a table does, so the id itself is the remount key.

import { onDestroy, onMount } from "svelte";
import type { Project } from "$shared/app-schema";
import * as Y from "yjs";
import { analyzeCalendarEditability } from "../../services/calendar/calendarEditability";
import { analyzeCalendarColumnWritability } from "../../services/calendar/calendarColumnWritability";
import { buildCalendarEntries, type CalendarEntry } from "../../services/calendar/calendarEntries";
import {
    resolveCalendarEntryWritability,
    writeCalendarEntryDuration,
    writeCalendarEntryStart,
} from "../../services/calendar/calendarEntryWrite";
import {
    computeViewRange,
    shiftAnchor,
    todayAnchor,
    type CalendarViewType,
} from "../../services/calendar/calendarGridRange";
import { collapseLanePath, entryAxisValues, groupCalendarEntries } from "../../services/calendar/calendarGrouping";
import { isLaneDropWritable, writeCalendarLaneDrop } from "../../services/calendar/calendarLaneWrite";
import { resolveDefaultWeekStart } from "../../services/calendar/calendarLocale";
import { layoutMonthGrid } from "../../services/calendar/calendarMonthGridLayout";
import {
    applyOptimisticOverrides,
    clearOptimisticOverride,
    createOptimisticOverrides,
    reconcileOptimisticOverrides,
    setOptimisticOverride,
    type OptimisticOverrides,
} from "../../services/calendar/calendarOptimisticPlacement";
import { runCalendarQuery } from "../../services/calendar/calendarQueryRunner";
import {
    DEFAULT_WORKING_HOURS_END_MINUTES,
    DEFAULT_WORKING_HOURS_START_MINUTES,
    type CalendarSettings,
    DEFAULT_CALENDAR_VIEW_TYPE,
    destroyCalendarUndoManager,
    ensureCalendarUndoManager,
    getCalendarMap,
    updateCalendar,
} from "../../services/calendar/calendarService";
import { layoutTimeGrid } from "../../services/calendar/calendarTimeGridLayout";
import { listSupportedTimeZones, resolveCalendarTimezone } from "../../services/calendar/calendarTimezone";
import { globalUndoRouter } from "../../services/undo/undoRouter";
import { projectSchemaName } from "../../services/yjstable/sqlNames";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import { REQUERY_DEBOUNCE_MS, type TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import CalendarLaneTimeGrid from "./CalendarLaneTimeGrid.svelte";
import CalendarMonthGrid from "./CalendarMonthGrid.svelte";
import CalendarRoleEditor from "./CalendarRoleEditor.svelte";
import CalendarTimeGrid from "./CalendarTimeGrid.svelte";

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
    laneOrder: [],
};

const VIEW_TYPE_OPTIONS: { value: CalendarViewType; label: string; }[] = [
    { value: "day", label: "Day" },
    { value: "days", label: "Multi-day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

let settings = $state<CalendarSettings>(EMPTY_SETTINGS);
let queryInput = $state("");
let result = $state<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>(undefined);
let writeError = $state<string | undefined>(undefined);
let anchorUtcMs = $state(Date.now());
let optimisticOverrides = $state<OptimisticOverrides>(createOptimisticOverrides());

const editability = $derived(analyzeCalendarEditability(result.columns));
const writableColumns = $derived(analyzeCalendarColumnWritability(settings.query));
// The view's timezone (§6.5) is an explicit, visible setting: absent means
// viewer-local, resolved here rather than left implicit. The SQL session
// timezone for this calendar's own query must equal it (`runQuery` below),
// and the grid range below is computed in it, so two collaborators viewing a
// calendar with a fixed timezone see the same window regardless of either
// viewer's own local zone.
const timeZone = $derived(resolveCalendarTimezone(settings.timezone));
const timeZoneOptions = listSupportedTimeZones();
const weekStart = $derived(settings.weekStart ?? resolveDefaultWeekStart());
const workingHoursStart = $derived(settings.workingHoursStartMinutes ?? DEFAULT_WORKING_HOURS_START_MINUTES);
const workingHoursEnd = $derived(settings.workingHoursEndMinutes ?? DEFAULT_WORKING_HOURS_END_MINUTES);
const KNOWN_VIEW_TYPES = new Set<CalendarViewType>(["day", "days", "week", "month"]);
// A stored viewType this component does not know how to grid (a future
// "gantt", or a stale value) falls back to "week" rather than crashing the
// range computation, which is only total over the known variants.
const viewType = $derived(
    KNOWN_VIEW_TYPES.has(settings.viewType as CalendarViewType) ? (settings.viewType as CalendarViewType) : "week",
);
const range = $derived(computeViewRange(anchorUtcMs, viewType, weekStart, timeZone));
// The same visible window, in the `{ start: Date, end: Date }` shape the
// query runner injects as `view.range_start`/`view.range_end` (§6.4). The
// grid keeps working in UTC millis; only the SQL boundary needs Dates.
const queryRange = $derived({ start: new Date(range.start), end: new Date(range.end) });

const rawEntries = $derived(buildCalendarEntries(result, settings));
const placedEntries = $derived(applyOptimisticOverrides(rawEntries, optimisticOverrides));

// Grouping is a client-side operation over result rows, never SQL GROUP BY
// (docs/crdt-sql-architecture.md §6.3). The time-grid swimlane/lane-drop
// wiring below groups by the *first* configured axis only — a calendar's
// lane-order/show-empty-lanes settings expose one ordered list, and
// multi-level nesting inside a single swimlane stack would need its own
// per-level UI; deeper axes remain available to `groupCalendarEntries`
// directly (e.g. a future Gantt row-section view, #4350) but are not yet
// rendered as nested swimlanes here.
const groupAxis = $derived(settings.groupAxes[0] as string | undefined);
const groupingActive = $derived(groupAxis !== undefined);
const lanes = $derived(
    groupAxis
        ? groupCalendarEntries(placedEntries, [groupAxis], {
            laneOrder: settings.laneOrder,
            showEmptyLanes: settings.showEmptyLanes,
        })
        : undefined,
);
const knownLaneValues = $derived(
    lanes?.map((lane) => lane.value).filter((v): v is string => v !== undefined) ?? [],
);

function laneLabelForEntry(entry: CalendarEntry): string {
    if (!groupAxis) return "";
    return collapseLanePath([entryAxisValues(entry, groupAxis)[0]]);
}

const monthLaneFilterOptions = $derived(lanes?.map((lane) => collapseLanePath(lane.path)) ?? []);
let monthLaneFilter = $state<string | undefined>(undefined);
const monthFilteredEntries = $derived(
    groupingActive && monthLaneFilter !== undefined
        ? placedEntries.filter((entry) => laneLabelForEntry(entry) === monthLaneFilter)
        : placedEntries,
);

const timeGridLayout = $derived(
    viewType === "month" || groupingActive ? undefined : layoutTimeGrid(placedEntries, range.start, range.end),
);
const monthCells = $derived(
    viewType === "month" ? layoutMonthGrid(monthFilteredEntries, range.start, range.end) : undefined,
);

function isStartWritable(entry: CalendarEntry): boolean {
    return resolveCalendarEntryWritability(entry, settings, writableColumns).startWritable;
}
function isDurationWritable(entry: CalendarEntry): boolean {
    return resolveCalendarEntryWritability(entry, settings, writableColumns).durationWritable;
}
function isLaneWritable(entry: CalendarEntry): boolean {
    return isLaneDropWritable(entry, groupAxis, writableColumns);
}

function readSettingsFromMap(): CalendarSettings | undefined {
    const map = getCalendarMap(project, calendarId);
    if (!map) return undefined;
    const groupAxesValue = map.get("groupAxes");
    const laneOrderValue = map.get("laneOrder");
    return {
        name: String(map.get("name") ?? ""),
        query: String(map.get("query") ?? ""),
        viewType: String(map.get("viewType") ?? DEFAULT_CALENDAR_VIEW_TYPE),
        timezone: map.get("timezone") as string | undefined,
        roleTitle: map.get("roleTitle") as string | undefined,
        roleStart: map.get("roleStart") as string | undefined,
        roleAllDay: map.get("roleAllDay") as string | undefined,
        roleDuration: map.get("roleDuration") as string | undefined,
        roleDue: map.get("roleDue") as string | undefined,
        groupAxes: groupAxesValue instanceof Y.Array ? groupAxesValue.toArray() : [],
        laneOrder: laneOrderValue instanceof Y.Array ? laneOrderValue.toArray() : [],
        showEmptyLanes: map.get("showEmptyLanes") as boolean | undefined,
        weekStart: map.get("weekStart") as number | undefined,
        workingHoursStartMinutes: map.get("workingHoursStartMinutes") as number | undefined,
        workingHoursEndMinutes: map.get("workingHoursEndMinutes") as number | undefined,
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
    const outcome = await runCalendarQuery(session, pgSchema, settings.query, queryRange, timeZone);
    if (outcome.result) {
        result = outcome.result;
        queryError = undefined;
        // The query result is authoritative: drop any optimistic placement
        // whose row has now come back, whether or not it agrees with the
        // local guess (a concurrent remote move wins either way).
        optimisticOverrides = reconcileOptimisticOverrides(optimisticOverrides, buildCalendarEntries(result, settings));
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
    const viewTypeChanged = next.viewType !== settings.viewType;
    const timezoneChanged = next.timezone !== settings.timezone;
    settings = next;
    queryInput = next.query;
    if (queryChanged || viewTypeChanged || timezoneChanged) scheduleRequery();
}

/**
 * Switch the calendar's timezone; an empty value clears it back to
 * viewer-local. Pass the empty string through as-is rather than `undefined`
 * — `updateCalendar` only touches a field when the update object mentions it
 * (`!== undefined`), and uses an empty string as the "clear" signal
 * (`setOrClear`), so `{ timezone: undefined }` here would be silently
 * ignored instead of clearing anything.
 */
function commitTimezone(e: Event) {
    updateCalendar(project, calendarId, { timezone: (e.target as HTMLSelectElement).value });
}

const mirrorObserver = () => refreshMirror();

function commitQuery(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    updateCalendar(project, calendarId, { query: value });
}

function setViewType(e: Event) {
    updateCalendar(project, calendarId, { viewType: (e.target as HTMLSelectElement).value });
}

function goToday() {
    anchorUtcMs = todayAnchor(timeZone, Date.now());
    scheduleRequery();
}
function goPrev() {
    anchorUtcMs = shiftAnchor(anchorUtcMs, viewType, weekStart, timeZone, -1);
    scheduleRequery();
}
function goNext() {
    anchorUtcMs = shiftAnchor(anchorUtcMs, viewType, weekStart, timeZone, 1);
    scheduleRequery();
}

const rangeLabel = $derived(
    `${new Date(range.start).toISOString().slice(0, 10)} – ${
        new Date(range.end - 1).toISOString().slice(0, 10)
    } (${timeZone})`,
);

// --- Write dispatch: drag/resize/keyboard all funnel through here. ---

function startColumn(): string | undefined {
    return settings.roleStart ? writableColumns.get(settings.roleStart) : undefined;
}
function durationColumn(): string | undefined {
    return settings.roleDuration ? writableColumns.get(settings.roleDuration) : undefined;
}

function previewStart(entry: CalendarEntry, newStartMs: number) {
    optimisticOverrides = setOptimisticOverride(optimisticOverrides, entry.key, { startMs: newStartMs });
}
function previewDuration(entry: CalendarEntry, newDurationMs: number) {
    optimisticOverrides = setOptimisticOverride(optimisticOverrides, entry.key, { durationMs: newDurationMs });
}

async function commitStart(entry: CalendarEntry, newStartMs: number) {
    previewStart(entry, newStartMs);
    const column = startColumn();
    if (!column) return;
    try {
        await writeCalendarEntryStart(session, entry, column, newStartMs);
        writeError = undefined;
    } catch (err) {
        optimisticOverrides = clearOptimisticOverride(optimisticOverrides, entry.key);
        writeError = err instanceof Error ? err.message : String(err);
    }
}

async function commitDuration(entry: CalendarEntry, newDurationMs: number) {
    previewDuration(entry, newDurationMs);
    const column = durationColumn();
    if (!column) return;
    try {
        await writeCalendarEntryDuration(session, entry, column, newDurationMs);
        writeError = undefined;
    } catch (err) {
        optimisticOverrides = clearOptimisticOverride(optimisticOverrides, entry.key);
        writeError = err instanceof Error ? err.message : String(err);
    }
}

function cancelDrag(entry: CalendarEntry) {
    optimisticOverrides = clearOptimisticOverride(optimisticOverrides, entry.key);
}

/**
 * Drop `entry` onto a lane (#4348). Unlike reschedule, a lane drop has no
 * optimistic placement of its own: the next query result is what moves the
 * card between swimlanes, since the write and the requery are both quick and
 * a lane change (unlike a pixel-accurate time drag) has no visible
 * snap-back to avoid.
 */
async function commitLaneDrop(entry: CalendarEntry, laneValue: string | undefined, mode: "replace" | "add") {
    if (!groupAxis) return;
    const column = writableColumns.get(groupAxis);
    if (!column) return;
    try {
        await writeCalendarLaneDrop(session, entry, groupAxis, column, laneValue, mode);
        writeError = undefined;
        // No optimistic override moves the card (see comment above), so the
        // requery itself is what makes the drop visible.
        await runQuery();
    } catch (err) {
        writeError = err instanceof Error ? err.message : String(err);
    }
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
        <div class="nav-controls">
            <button type="button" data-testid="calendar-nav-prev" onclick={goPrev}>‹</button>
            <button type="button" data-testid="calendar-nav-today" onclick={goToday}>Today</button>
            <button type="button" data-testid="calendar-nav-next" onclick={goNext}>›</button>
            <span class="range-label" data-testid="calendar-range-label">{rangeLabel}</span>
        </div>
        <select data-testid="calendar-view-type" value={viewType} onchange={setViewType}>
            {#each VIEW_TYPE_OPTIONS as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
            {/each}
        </select>
        <div class="undo-controls">
            <button type="button" data-testid="calendar-undo" onclick={() => globalUndoRouter.undo()}>Undo</button>
            <button type="button" data-testid="calendar-redo" onclick={() => globalUndoRouter.redo()}>Redo</button>
        </div>
    </div>

    <div class="view-toolbar">
        <label class="timezone-control">
            <span>Timezone</span>
            <select data-testid="calendar-timezone-select" value={settings.timezone ?? ""} onchange={commitTimezone}>
                <option value="">Viewer-local ({resolveCalendarTimezone(undefined)})</option>
                {#each timeZoneOptions as tz (tz)}
                    <option value={tz}>{tz}</option>
                {/each}
            </select>
        </label>
        <span class="active-timezone" data-testid="calendar-active-timezone">{timeZone}</span>
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
    {#if writeError}
        <p class="error" data-testid="calendar-write-error">{writeError}</p>
    {/if}

    <CalendarRoleEditor
        {project}
        {calendarId}
        query={settings.query}
        resultColumns={result.columns}
        roles={{
            roleTitle: settings.roleTitle,
            roleStart: settings.roleStart,
            roleAllDay: settings.roleAllDay,
            roleDuration: settings.roleDuration,
            roleDue: settings.roleDue,
            groupAxes: settings.groupAxes,
            laneOrder: settings.laneOrder,
            showEmptyLanes: settings.showEmptyLanes,
        }}
        readOnly={!editability.editable}
        readOnlyReason={editability.readOnlyReason}
        {knownLaneValues}
    />

    {#if !editability.editable}
        <p class="hint">Grid views below render this query's result, but nothing can be dragged until it is writable.</p>
    {/if}

    {#if viewType === "month" && monthCells}
        {#if groupingActive}
            <label class="lane-filter-control">
                <span>Lane</span>
                <select
                    data-testid="calendar-month-lane-filter"
                    value={monthLaneFilter ?? ""}
                    onchange={(e) => {
                        const value = (e.target as HTMLSelectElement).value;
                        monthLaneFilter = value === "" ? undefined : value;
                    }}
                >
                    <option value="">All lanes</option>
                    {#each monthLaneFilterOptions as label (label)}
                        <option value={label}>{label}</option>
                    {/each}
                </select>
            </label>
        {/if}
        <CalendarMonthGrid
            cells={monthCells}
            {weekStart}
            todayUtcMs={todayAnchor(timeZone, Date.now())}
            {isStartWritable}
            onDragEnd={commitStart}
            onKeyboardMove={commitStart}
            laneLabel={groupingActive ? laneLabelForEntry : undefined}
        />
    {:else if groupingActive && lanes}
        <CalendarLaneTimeGrid
            {lanes}
            rangeStart={range.start}
            rangeEnd={range.end}
            workingHoursStartMinutes={workingHoursStart}
            workingHoursEndMinutes={workingHoursEnd}
            {isStartWritable}
            {isDurationWritable}
            {isLaneWritable}
            onDragMove={previewStart}
            onDragEnd={commitStart}
            onDragCancel={cancelDrag}
            onResizeMove={previewDuration}
            onResizeEnd={commitDuration}
            onKeyboardMove={commitStart}
            onLaneDrop={commitLaneDrop}
        />
    {:else if timeGridLayout}
        <CalendarTimeGrid
            layout={timeGridLayout}
            rangeStart={range.start}
            workingHoursStartMinutes={workingHoursStart}
            workingHoursEndMinutes={workingHoursEnd}
            {isStartWritable}
            {isDurationWritable}
            onDragMove={previewStart}
            onDragEnd={commitStart}
            onDragCancel={cancelDrag}
            onResizeMove={previewDuration}
            onResizeEnd={commitDuration}
            onKeyboardMove={commitStart}
        />
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
    flex-wrap: wrap;
}

.calendar-name {
    font-weight: 600;
    color: #111827;
}

.nav-controls {
    display: flex;
    align-items: center;
    gap: 4px;
}

.range-label {
    font-size: 0.75rem;
    color: #6b7280;
    margin-left: 6px;
}

.undo-controls {
    display: flex;
    gap: 4px;
}

.nav-controls button,
.undo-controls button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 2px 10px;
    cursor: pointer;
    font-size: 0.8rem;
}

.timezone-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #374151;
}

.timezone-control select {
    font-size: 0.8rem;
}

.lane-filter-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #374151;
}

.active-timezone {
    font-size: 0.8rem;
    color: #6b7280;
}

.editor-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    margin: 4px 0 0;
}

input,
select {
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
</style>
