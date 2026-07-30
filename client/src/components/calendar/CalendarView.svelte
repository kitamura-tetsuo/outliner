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
import { utcMsToFloatingDate } from "$shared/utils/zonedTime";
import * as Y from "yjs";
import { analyzeCalendarEditability } from "../../services/calendar/calendarEditability";
import { analyzeCalendarColumnWritability } from "../../services/calendar/calendarColumnWritability";
import { buildCalendarEntries, type CalendarEntry } from "../../services/calendar/calendarEntries";
import {
    resolveCalendarEntryWritability,
    writeCalendarEntryDuration,
    writeCalendarEntryStart,
} from "../../services/calendar/calendarEntryWrite";
import type { GanttRow } from "../../services/calendar/calendarGanttLayout";
import { analyzeGanttSubtreeShift, applyGanttSubtreeShift, type GanttSubtreeShiftAnalysis } from "../../services/calendar/calendarGanttWrite";
import {
    computeGanttRange,
    computeGanttTicks,
    computeViewRange,
    DEFAULT_GANTT_SCALE,
    type GanttScale,
    shiftAnchor,
    shiftGanttAnchor,
    todayAnchor,
    type CalendarViewType,
} from "../../services/calendar/calendarGridRange";
import {
    collapseLanePath,
    entryAxisValues,
    groupCalendarEntries,
    isMultiValuedAxis,
} from "../../services/calendar/calendarGrouping";
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
import { computeDayHeaders } from "../../services/calendar/calendarDayHeaders";
import { layoutTimeGrid } from "../../services/calendar/calendarTimeGridLayout";
import { listSupportedTimeZones, resolveCalendarTimezone } from "../../services/calendar/calendarTimezone";
import { globalUndoRouter } from "../../services/undo/undoRouter";
import { projectSchemaName } from "../../services/yjstable/sqlNames";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import { REQUERY_DEBOUNCE_MS, type TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import CalendarGanttChart from "./CalendarGanttChart.svelte";
import CalendarCreateEntryDialog from "./CalendarCreateEntryDialog.svelte";
import CalendarDeleteEntryDialog from "./CalendarDeleteEntryDialog.svelte";
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

const VIEW_TYPE_OPTIONS: { value: string; label: string; }[] = [
    { value: "day", label: "Day" },
    { value: "days", label: "Multi-day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "gantt", label: "Gantt" },
];

const GANTT_SCALES = new Set<GanttScale>(["day", "week", "month", "quarter"]);

let settings = $state<CalendarSettings>(EMPTY_SETTINGS);
let queryInput = $state("");
let result = $state<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>(undefined);
let writeError = $state<string | undefined>(undefined);
let anchorUtcMs = $state(Date.now());
let optimisticOverrides = $state<OptimisticOverrides>(createOptimisticOverrides());
let showCreateDialog = $state(false);
let createDefaultStartMs = $state<number | undefined>(undefined);
let deletingEntry = $state<CalendarEntry | undefined>(undefined);

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
const isGantt = $derived(settings.viewType === "gantt");
// A stored viewType this component does not know how to grid (a stale
// value) falls back to "week" rather than crashing the range computation,
// which is only total over the known variants. Irrelevant when `isGantt`,
// which uses its own scale/range below.
const viewType = $derived(
    KNOWN_VIEW_TYPES.has(settings.viewType as CalendarViewType) ? (settings.viewType as CalendarViewType) : "week",
);
const ganttScale = $derived(
    GANTT_SCALES.has(settings.ganttScale as GanttScale) ? (settings.ganttScale as GanttScale) : DEFAULT_GANTT_SCALE,
);
const range = $derived(
    isGantt ? computeGanttRange(anchorUtcMs, ganttScale, timeZone) : computeViewRange(anchorUtcMs, viewType, weekStart, timeZone),
);
const ganttTicks = $derived(isGantt ? computeGanttTicks(range.start, range.end, ganttScale, timeZone) : []);
// The same visible window, in the `{ start: Date, end: Date }` shape the
// query runner injects as `view.range_start`/`view.range_end` (§6.4). The
// grid keeps working in UTC millis; only the SQL boundary needs Dates.
const queryRange = $derived({ start: new Date(range.start), end: new Date(range.end) });

const rawEntries = $derived(buildCalendarEntries(result, settings, timeZone));
const placedEntries = $derived(applyOptimisticOverrides(rawEntries, optimisticOverrides));
const entryByKey = $derived(new Map(placedEntries.map((e) => [e.key, e])));

// Grouping is a client-side operation over result rows, never SQL GROUP BY
// (docs/crdt-sql-architecture.md §6.3). The time-grid swimlane/lane-drop
// wiring below groups by the *first* configured axis only — a calendar's
// lane-order/show-empty-lanes settings expose one ordered list, and
// multi-level nesting inside a single swimlane stack would need its own
// per-level UI; deeper axes remain available to `groupCalendarEntries`
// directly (the Gantt view's own lane sections, #4350) but are not yet
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
    isGantt || viewType === "month" || groupingActive
        ? undefined
        : layoutTimeGrid(placedEntries, range.start, range.end),
);
const dayHeaders = $derived(
    isGantt || viewType === "month"
        ? undefined
        : computeDayHeaders(range.start, timeGridLayout?.dayCount ?? lanes?.[0]?.layout?.dayCount ?? 1, timeZone)
);
const monthCells = $derived(
    !isGantt && viewType === "month" ? layoutMonthGrid(monthFilteredEntries, range.start, range.end) : undefined,
);

function isStartWritable(entry: CalendarEntry): boolean {
    return resolveCalendarEntryWritability(entry, settings, writableColumns).startWritable;
}
function isDurationWritable(entry: CalendarEntry): boolean {
    return resolveCalendarEntryWritability(entry, settings, writableColumns).durationWritable;
}
/**
 * Whether a delete affordance should show at all for `entry` — addressability
 * (source_kind/source_id present), not column writability: `assertWriteAllowed`
 * makes the final call once the user actually chooses a disposition.
 */
function isDeletable(entry: CalendarEntry): boolean {
    return Boolean(entry.sourceKind && entry.sourceId);
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
        ganttScale: map.get("ganttScale") as string | undefined,
    };
}

let queryGeneration = 0;
let requeryTimer: ReturnType<typeof setTimeout> | undefined;
// project/projectId/calendarId are static within the component lifecycle due
// to `{#key}` (a prop change remounts the whole view, per AGENTS.md §11).
// svelte-ignore state_referenced_locally
const pgSchema = projectSchemaName(projectId);
// svelte-ignore state_referenced_locally
const session = createTableEngineSession({ projectDoc: project.ydoc, projectId });

async function runQuery() {
    const generation = ++queryGeneration;
    const outcome = await runCalendarQuery(session, pgSchema, settings.query, queryRange, timeZone);
    if (generation !== queryGeneration) return;
    if (outcome.result) {
        result = outcome.result;
        queryError = undefined;
        // The query result is authoritative: drop any optimistic placement
        // whose row has now come back, whether or not it agrees with the
        // local guess (a concurrent remote move wins either way).
        optimisticOverrides = reconcileOptimisticOverrides(optimisticOverrides, buildCalendarEntries(result, settings, timeZone));
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
    const ganttScaleChanged = next.ganttScale !== settings.ganttScale;
    settings = next;
    queryInput = next.query;
    if (queryChanged || viewTypeChanged || timezoneChanged || ganttScaleChanged) scheduleRequery();
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

function commitGanttScale(scale: GanttScale) {
    updateCalendar(project, calendarId, { ganttScale: scale });
}

function goToday() {
    anchorUtcMs = todayAnchor(timeZone, Date.now());
    scheduleRequery();
}
function goPrev() {
    anchorUtcMs = isGantt
        ? shiftGanttAnchor(anchorUtcMs, ganttScale, timeZone, -1)
        : shiftAnchor(anchorUtcMs, viewType, weekStart, timeZone, -1);
    scheduleRequery();
}
function goNext() {
    anchorUtcMs = isGantt
        ? shiftGanttAnchor(anchorUtcMs, ganttScale, timeZone, 1)
        : shiftAnchor(anchorUtcMs, viewType, weekStart, timeZone, 1);
    scheduleRequery();
}

// The range boundaries are instants at the *calendar zone's* midnight, so
// the label must read them back in that zone; `toISOString` would name the
// UTC day, which is the previous one for any zone ahead of UTC.
const rangeLabel = $derived(
    `${utcMsToFloatingDate(range.start, timeZone)} – ${utcMsToFloatingDate(range.end - 1, timeZone)} (${timeZone})`,
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
        await writeCalendarEntryStart(session, entry, column, newStartMs, timeZone);
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

// --- Gantt's own write: a parent roll-up bar has no start column of its
// own, so dragging it shifts every start-bearing descendant's own `start`
// directly (calendarGanttWrite.ts), never through the relation write path
// leaf bars use — see that module's header comment for why.

function subtreeShiftAnalysis(row: GanttRow): GanttSubtreeShiftAnalysis {
    return analyzeGanttSubtreeShift(row, entryByKey, settings, writableColumns);
}

function commitSubtreeShift(_row: GanttRow, deltaMs: number, analysis: GanttSubtreeShiftAnalysis) {
    let next = optimisticOverrides;
    for (const member of analysis.members) {
        next = setOptimisticOverride(next, member.key, { startMs: member.startMs + deltaMs });
    }
    optimisticOverrides = next;
    try {
        applyGanttSubtreeShift(project, analysis.members, deltaMs, timeZone);
        writeError = undefined;
    } catch (err) {
        for (const member of analysis.members) {
            optimisticOverrides = clearOptimisticOverride(optimisticOverrides, member.key);
        }
        writeError = err instanceof Error ? err.message : String(err);
    }
}

// --- New entry / delete: #4349. ---

function openCreateDialog() {
    createDefaultStartMs = anchorUtcMs;
    showCreateDialog = true;
}
function onEntryCreated() {
    showCreateDialog = false;
    writeError = undefined;
    scheduleRequery();
}
function onCreateCancelled() {
    showCreateDialog = false;
}

function requestDelete(entry: CalendarEntry) {
    deletingEntry = entry;
}
function onEntryDeleted() {
    deletingEntry = undefined;
    writeError = undefined;
    scheduleRequery();
}
function onDeleteCancelled() {
    deletingEntry = undefined;
}

/**
 * Drop `entry` onto a lane (#4348). Mirror the target membership
 * optimistically: the Yjs -> PGlite projection is asynchronous, so waiting
 * for its query round-trip would leave a successfully dropped card in the
 * old lane. The next authoritative query result reconciles the mirror.
 */
async function commitLaneDrop(entry: CalendarEntry, laneValue: string | undefined, mode: "replace" | "add") {
    if (!groupAxis) return;
    const column = writableColumns.get(groupAxis);
    if (!column) return;
    const multiValued = isMultiValuedAxis(entry, groupAxis);
    const currentValues = entryAxisValues(entry, groupAxis).filter((value): value is string => value !== undefined);
    const nextValues = mode === "add" && laneValue !== undefined
        ? Array.from(new Set([...currentValues, laneValue]))
        : laneValue === undefined ? [] : [laneValue];
    const optimisticValue = multiValued ? JSON.stringify(nextValues) : laneValue;
    optimisticOverrides = setOptimisticOverride(optimisticOverrides, entry.key, {
        raw: { [groupAxis]: optimisticValue },
    });
    try {
        await writeCalendarLaneDrop(session, entry, groupAxis, column, laneValue, mode);
        writeError = undefined;
        scheduleRequery();
    } catch (err) {
        optimisticOverrides = clearOptimisticOverride(optimisticOverrides, entry.key);
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
            <button type="button" data-testid="calendar-new-entry" onclick={openCreateDialog}>New entry</button>
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

    {#if isGantt}
        <CalendarGanttChart
            entries={placedEntries}
            groupAxes={settings.groupAxes}
            rangeStart={range.start}
            rangeEnd={range.end}
            ticks={ganttTicks}
            scale={ganttScale}
            onScaleChange={commitGanttScale}
            isLeafStartWritable={isStartWritable}
            isLeafDurationWritable={isDurationWritable}
            analyzeSubtreeShift={subtreeShiftAnalysis}
            onLeafDragMove={previewStart}
            onLeafDragEnd={commitStart}
            onLeafDragCancel={cancelDrag}
            onLeafResizeMove={previewDuration}
            onLeafResizeEnd={commitDuration}
            onLeafKeyboardMove={commitStart}
            onSubtreeDragEnd={commitSubtreeShift}
        />
    {:else if viewType === "month" && monthCells}
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
            {isDeletable}
            onDeleteRequest={requestDelete}
            laneLabel={groupingActive ? laneLabelForEntry : undefined}
        />
    {:else if groupingActive && lanes}
        <CalendarLaneTimeGrid
            {lanes}
            {dayHeaders}
            todayUtcMs={todayAnchor(timeZone, Date.now())}
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
            {isDeletable}
            onDeleteRequest={requestDelete}
        />
    {:else if timeGridLayout}
        <CalendarTimeGrid
            layout={timeGridLayout}
            {dayHeaders}
            todayUtcMs={todayAnchor(timeZone, Date.now())}
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
            {isDeletable}
            onDeleteRequest={requestDelete}
        />
    {/if}
</div>

{#if showCreateDialog}
    <CalendarCreateEntryDialog
        {project}
        projectId={projectId ?? pgSchema}
        resolver={session}
        defaultStartMs={createDefaultStartMs}
        defaultAllDay={viewType === "month"}
        {timeZone}
        onCreated={onEntryCreated}
        onCancel={onCreateCancelled}
    />
{/if}

{#if deletingEntry}
    <CalendarDeleteEntryDialog
        {project}
        resolver={session}
        entry={deletingEntry}
        onDeleted={onEntryDeleted}
        onCancel={onDeleteCancelled}
    />
{/if}

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
