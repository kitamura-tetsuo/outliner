<script lang="ts">
// The calendar indicator on a source outline item (#4981).
//
// Renders only when `calendarScheduleIndex` says the item is currently
// represented by at least one calendar entry, and shows the scheduling
// details on hover *and* on keyboard focus — an icon whose information only a
// pointer can reach is not an affordance for everyone. Every membership is
// listed: an item on two calendars shows both, never one arbitrarily.
//
// The lookup is a constant-time map read guarded by the index's version
// counter, so no query, timer or tree scan happens per outline row.

import { formatScheduleDetailLines, formatScheduleSummary } from "../services/calendar/calendarScheduleDetails";
import { calendarScheduleIndex } from "../services/calendar/calendarScheduleIndex.svelte";

interface Props {
    itemId: string;
}

let { itemId }: Props = $props();

const memberships = $derived.by(() => {
    void calendarScheduleIndex.version;
    return calendarScheduleIndex.lookupItem(itemId);
});
const detailLines = $derived(formatScheduleDetailLines(memberships));
const summary = $derived(formatScheduleSummary(memberships));

let isHovered = $state(false);
let isFocused = $state(false);
// Pointer users who tapped the icon keep the details open until they dismiss
// them - a touch device has no hover state to rely on.
let isPinned = $state(false);
const isOpen = $derived(isHovered || isFocused || isPinned);

const tooltipId = $derived(`calendar-schedule-tooltip-${itemId}`);

function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && isPinned) {
        e.stopPropagation();
        isPinned = false;
    }
}
</script>

{#if memberships.length > 0}
    <span class="calendar-indicator">
        <button
            type="button"
            class="calendar-indicator-button"
            data-testid="calendar-indicator-{itemId}"
            data-calendar-count={memberships.length}
            draggable="false"
            aria-label={summary}
            aria-describedby={isOpen ? tooltipId : undefined}
            aria-expanded={isOpen}
            onclick={(e) => {
                e.stopPropagation();
                isPinned = !isPinned;
            }}
            onpointerdown={(e) => { e.stopPropagation(); }}
            onmousedown={(e) => { e.stopPropagation(); }}
            onmouseup={(e) => { e.stopPropagation(); }}
            onmouseenter={() => { isHovered = true; }}
            onmouseleave={() => { isHovered = false; }}
            onfocus={() => { isFocused = true; }}
            onblur={() => { isFocused = false; isPinned = false; }}
            onkeydown={onKeyDown}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="calendar-indicator-icon"
                aria-hidden="true"
            >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            {#if memberships.length > 1}
                <span class="calendar-indicator-count">{memberships.length}</span>
            {/if}
        </button>

        {#if isOpen}
            <span
                class="calendar-indicator-tooltip"
                id={tooltipId}
                role="tooltip"
                data-testid="calendar-schedule-tooltip-{itemId}"
            >
                {#each detailLines as line, i (i)}
                    <span class="calendar-indicator-line">{line}</span>
                {/each}
            </span>
        {/if}
    </span>
{/if}

<style>
.calendar-indicator {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-left: 4px;
}

.calendar-indicator-button {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: none;
    border: none;
    padding: 2px 4px;
    border-radius: 3px;
    cursor: pointer;
    color: #1976d2;
    line-height: 1;
}

.calendar-indicator-button:hover,
.calendar-indicator-button:focus-visible {
    background-color: #e3f2fd;
}

.calendar-indicator-count {
    font-size: 0.7rem;
    font-weight: 600;
}

.calendar-indicator-tooltip {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 180px;
    max-width: 320px;
    margin-top: 4px;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    color: #374151;
    font-size: 0.75rem;
    white-space: normal;
    text-align: left;
    pointer-events: none;
}

.calendar-indicator-line {
    display: block;
}
</style>
