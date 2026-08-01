#!/bin/bash

# CalendarTimeGrid
sed -i 's/import CalendarEntryCard from ".\/CalendarEntryCard.svelte";/import CalendarEntryCard from ".\/CalendarEntryCard.svelte";\nimport CalendarDragTooltip from ".\/CalendarDragTooltip.svelte";\nimport { formatDragMoveLabel, formatDragResizeLabel } from "..\/..\/services\/calendar\/calendarDragLabel";/' client/src/components/calendar/CalendarTimeGrid.svelte

sed -i 's/    onDeleteRequest?: (sourceId: string) => void;/    onDeleteRequest?: (sourceId: string) => void;\n    timeZone: string;/' client/src/components/calendar/CalendarTimeGrid.svelte

sed -i 's/let { layout, rangeStart, workingHoursStartMinutes, workingHoursEndMinutes, dayHeaders, todayUtcMs, isStartWritable, isDurationWritable, onDragMove, onDragEnd, onDragCancel, onResizeMove, onResizeEnd, onKeyboardMove, isDeletable, onDeleteRequest }: Props = $props();/let { layout, rangeStart, workingHoursStartMinutes, workingHoursEndMinutes, dayHeaders, todayUtcMs, isStartWritable, isDurationWritable, onDragMove, onDragEnd, onDragCancel, onResizeMove, onResizeEnd, onKeyboardMove, isDeletable, onDeleteRequest, timeZone }: Props = $props();/' client/src/components/calendar/CalendarTimeGrid.svelte

# Multiline match using perl because sed is too hard
perl -i -0pe 's/let drag = \$state<\n    \{\n        kind: "resize" \| "move";\n        entry: CalendarEntry;\n        pointerId: number;\n        startClientX: number;\n        startClientY: number;\n        originStartMs: number;\n        originDurationMs: number;\n    \} \| undefined\n>\(\);/let drag = \$state<{\n    kind: "resize" | "move";\n    entry: CalendarEntry;\n    pointerId: number;\n    startClientX: number;\n    startClientY: number;\n    originStartMs: number;\n    originDurationMs: number;\n    label?: string;\n    clientX?: number;\n    clientY?: number;\n} | undefined>();/g' client/src/components/calendar/CalendarTimeGrid.svelte

# The assignments
perl -i -0pe 's/drag = \{\n            kind: "move",\n            entry,\n            pointerId: e\.pointerId,\n            startClientX: e\.clientX,\n            startClientY: e\.clientY,\n            originStartMs: entry\.startMs,\n            originDurationMs: entry\.durationMs,\n        \};/drag = {\n            kind: "move",\n            entry,\n            pointerId: e.pointerId,\n            startClientX: e.clientX,\n            startClientY: e.clientY,\n            originStartMs: entry.startMs,\n            originDurationMs: entry.durationMs,\n            clientX: e.clientX,\n            clientY: e.clientY\n        };/g' client/src/components/calendar/CalendarTimeGrid.svelte

perl -i -0pe 's/drag = \{\n            kind: "resize",\n            entry,\n            pointerId: e\.pointerId,\n            startClientX: e\.clientX,\n            startClientY: e\.clientY,\n            originStartMs: entry\.startMs,\n            originDurationMs: entry\.durationMs,\n        \};/drag = {\n            kind: "resize",\n            entry,\n            pointerId: e.pointerId,\n            startClientX: e.clientX,\n            startClientY: e.clientY,\n            originStartMs: entry.startMs,\n            originDurationMs: entry.durationMs,\n            clientX: e.clientX,\n            clientY: e.clientY\n        };/g' client/src/components/calendar/CalendarTimeGrid.svelte

sed -i 's/if (!drag) return;/if (!drag) return;\n        drag.clientX = e.clientX;\n        drag.clientY = e.clientY;/' client/src/components/calendar/CalendarTimeGrid.svelte

sed -i 's/onDragMove?.(drag.entry.sourceId, newStartMs);/onDragMove?.(drag.entry.sourceId, newStartMs);\n            drag.label = formatDragMoveLabel(drag.entry as any, newStartMs, timeZone);/' client/src/components/calendar/CalendarTimeGrid.svelte

sed -i 's/onResizeMove?.(drag.entry.sourceId, newDurationMs);/onResizeMove?.(drag.entry.sourceId, newDurationMs);\n            drag.label = formatDragResizeLabel(drag.entry as any, newDurationMs, timeZone);/' client/src/components/calendar/CalendarTimeGrid.svelte

sed -i 's/    <\/div>\n<\/div>\n\n<style>/    <\/div>\n    {#if drag \&\& drag.label \&\& drag.clientX !== undefined \&\& drag.clientY !== undefined}\n        <CalendarDragTooltip label={drag.label} clientX={drag.clientX} clientY={drag.clientY} \/>\n    {\/if}\n<\/div>\n\n<style>/' client/src/components/calendar/CalendarTimeGrid.svelte


# CalendarGanttChart
sed -i 's/import { scaleToViewRange } from "..\/..\/services\/calendar\/calendarViewRange";/import { scaleToViewRange } from "..\/..\/services\/calendar\/calendarViewRange";\nimport CalendarDragTooltip from ".\/CalendarDragTooltip.svelte";\nimport { formatDragMoveLabel, formatDragResizeLabel, formatSubtreeShiftLabel } from "..\/..\/services\/calendar\/calendarDragLabel";/' client/src/components/calendar/CalendarGanttChart.svelte

sed -i 's/    onSubtreeDragEnd?: (sourceId: string, shiftMs: number) => void;/    onSubtreeDragEnd?: (sourceId: string, shiftMs: number) => void;\n    timeZone: string;/' client/src/components/calendar/CalendarGanttChart.svelte

sed -i 's/    onSubtreeDragEnd,\n}: Props = $props();/    onSubtreeDragEnd,\n    timeZone,\n}: Props = $props();/' client/src/components/calendar/CalendarGanttChart.svelte

perl -i -0pe 's/let pointerTracker = \$state<\n    \{\n        entryId: string;\n        startX: number;\n        originalMs: number;\n        mode: "move-leaf" \| "resize-end" \| "shift-subtree";\n        previewDeltaMs\?: number;\n    \} \| undefined\n>\(\);/let pointerTracker = \$state<{\n    entryId: string;\n    startX: number;\n    originalMs: number;\n    mode: "move-leaf" | "resize-end" | "shift-subtree";\n    previewDeltaMs?: number;\n    label?: string;\n    clientX?: number;\n    clientY?: number;\n} | undefined>();/g' client/src/components/calendar/CalendarGanttChart.svelte

perl -i -0pe 's/pointerTracker = \{\n            entryId,\n            startX: e\.clientX,\n            originalMs: entry\.startMs,\n            mode: "move-leaf",\n        \};/pointerTracker = {\n            entryId,\n            startX: e.clientX,\n            originalMs: entry.startMs,\n            mode: "move-leaf",\n            clientX: e.clientX,\n            clientY: e.clientY\n        };/g' client/src/components/calendar/CalendarGanttChart.svelte

perl -i -0pe 's/pointerTracker = \{\n            entryId,\n            startX: e\.clientX,\n            originalMs: Math\.max\(rangeStart, entry\.startMs\),\n            mode: "resize-end",\n        \};/pointerTracker = {\n            entryId,\n            startX: e.clientX,\n            originalMs: Math.max(rangeStart, entry.startMs),\n            mode: "resize-end",\n            clientX: e.clientX,\n            clientY: e.clientY\n        };/g' client/src/components/calendar/CalendarGanttChart.svelte

perl -i -0pe 's/pointerTracker = \{\n            entryId,\n            startX: e\.clientX,\n            originalMs: entry\.rollUp\.startMs,\n            mode: "shift-subtree",\n        \};/pointerTracker = {\n            entryId,\n            startX: e.clientX,\n            originalMs: entry.rollUp.startMs,\n            mode: "shift-subtree",\n            clientX: e.clientX,\n            clientY: e.clientY\n        };/g' client/src/components/calendar/CalendarGanttChart.svelte

sed -i 's/pointerTracker.previewDeltaMs = snappedDeltaMs;/pointerTracker.previewDeltaMs = snappedDeltaMs;\n        pointerTracker.clientX = e.clientX;\n        pointerTracker.clientY = e.clientY;/' client/src/components/calendar/CalendarGanttChart.svelte

sed -i 's/onLeafDragMove?.(entry.sourceId, newStartMs);/onLeafDragMove?.(entry.sourceId, newStartMs);\n            pointerTracker.label = formatDragMoveLabel(entry as any, newStartMs, timeZone);/' client/src/components/calendar/CalendarGanttChart.svelte

sed -i 's/onLeafResizeMove?.(entry.sourceId, newDurationMs);/onLeafResizeMove?.(entry.sourceId, newDurationMs);\n            pointerTracker.label = formatDragResizeLabel(entry as any, newDurationMs, timeZone);/' client/src/components/calendar/CalendarGanttChart.svelte

sed -i 's/\/\/ Shift previews are not currently sent up, but they could be./\/\/ Shift previews are not currently sent up, but they could be.\n            pointerTracker.label = formatSubtreeShiftLabel(snappedDeltaMs, pointerTracker.originalMs + snappedDeltaMs, timeZone);/' client/src/components/calendar/CalendarGanttChart.svelte

sed -i 's/    <\/div>\n<\/div>\n\n<style>/    <\/div>\n    {#if pointerTracker \&\& pointerTracker.label \&\& pointerTracker.clientX !== undefined \&\& pointerTracker.clientY !== undefined}\n        <CalendarDragTooltip label={pointerTracker.label} clientX={pointerTracker.clientX} clientY={pointerTracker.clientY} \/>\n    {\/if}\n<\/div>\n\n<style>/' client/src/components/calendar/CalendarGanttChart.svelte

# CalendarMonthGrid
sed -i 's/import CalendarEntryCard from ".\/CalendarEntryCard.svelte";/import CalendarEntryCard from ".\/CalendarEntryCard.svelte";\nimport CalendarDragTooltip from ".\/CalendarDragTooltip.svelte";\nimport { formatDragMoveLabel } from "..\/..\/services\/calendar\/calendarDragLabel";/' client/src/components/calendar/CalendarMonthGrid.svelte

sed -i 's/    laneLabel?: string;/    laneLabel?: string;\n    timeZone: string;/' client/src/components/calendar/CalendarMonthGrid.svelte

sed -i 's/let { cells, weekStart, todayUtcMs, isStartWritable, onDragEnd, onKeyboardMove, isDeletable, onDeleteRequest, laneLabel }: Props = $props();/let { cells, weekStart, todayUtcMs, isStartWritable, onDragEnd, onKeyboardMove, isDeletable, onDeleteRequest, laneLabel, timeZone }: Props = $props();/' client/src/components/calendar/CalendarMonthGrid.svelte

sed -i 's/let isAnyDragActive = $state(false);/let isAnyDragActive = $state(false);\nlet dragTooltip = $state<{ label: string, clientX: number, clientY: number } | undefined>();/' client/src/components/calendar/CalendarMonthGrid.svelte

sed -i 's/isAnyDragActive = true;/isAnyDragActive = true;\n        dragTooltip = undefined;/' client/src/components/calendar/CalendarMonthGrid.svelte

perl -i -0pe 's/e\.preventDefault\(\);\n        if \(e\.dataTransfer\) \{\n            e\.dataTransfer\.dropEffect = "move";\n        \}/e.preventDefault();\n        if (e.dataTransfer) {\n            e.dataTransfer.dropEffect = "move";\n        }\n        try {\n            if (dragSourceId) {\n                let draggedEntry: any;\n                for (const cell of cells) {\n                    for (const row of cell.rowSlots) {\n                        if (row && (row as any).sourceId === dragSourceId) {\n                            draggedEntry = row;\n                            break;\n                        }\n                    }\n                    if (draggedEntry) break;\n                }\n                if (draggedEntry) {\n                    dragTooltip = {\n                        label: formatDragMoveLabel(draggedEntry, cellDateMs, timeZone),\n                        clientX: e.clientX,\n                        clientY: e.clientY\n                    };\n                }\n            }\n        } catch (err) {}/g' client/src/components/calendar/CalendarMonthGrid.svelte

perl -i -0pe 's/function onDragEndHandler\(\) \{\n        isAnyDragActive = false;\n        dragSourceId = undefined;\n    \}/function onDragEndHandler() {\n        isAnyDragActive = false;\n        dragSourceId = undefined;\n        dragTooltip = undefined;\n    }/g' client/src/components/calendar/CalendarMonthGrid.svelte

sed -i 's/function onDrop(e: DragEvent, cellDateMs: number) {/function onDrop(e: DragEvent, cellDateMs: number) {\n        dragTooltip = undefined;/' client/src/components/calendar/CalendarMonthGrid.svelte

sed -i 's/function onDragLeave() {/function onDragLeave() {\n        dragTooltip = undefined;/' client/src/components/calendar/CalendarMonthGrid.svelte

sed -i 's/    <\/div>\n<\/div>\n\n<style>/    <\/div>\n    {#if dragTooltip}\n        <CalendarDragTooltip label={dragTooltip.label} clientX={dragTooltip.clientX} clientY={dragTooltip.clientY} \/>\n    {\/if}\n<\/div>\n\n<style>/' client/src/components/calendar/CalendarMonthGrid.svelte

# CalendarLaneTimeGrid
sed -i 's/    onDeleteRequest?: (sourceId: string) => void;/    onDeleteRequest?: (sourceId: string) => void;\n    timeZone: string;/' client/src/components/calendar/CalendarLaneTimeGrid.svelte

sed -i 's/let { lanes, rangeStart, rangeEnd, workingHoursStartMinutes, workingHoursEndMinutes, dayHeaders, todayUtcMs, isStartWritable, isDurationWritable, isLaneWritable, onDragMove, onDragEnd, onDragCancel, onResizeMove, onResizeEnd, onKeyboardMove, onLaneDrop, isDeletable, onDeleteRequest }: Props = $props();/let { lanes, rangeStart, rangeEnd, workingHoursStartMinutes, workingHoursEndMinutes, dayHeaders, todayUtcMs, isStartWritable, isDurationWritable, isLaneWritable, onDragMove, onDragEnd, onDragCancel, onResizeMove, onResizeEnd, onKeyboardMove, onLaneDrop, isDeletable, onDeleteRequest, timeZone }: Props = $props();/' client/src/components/calendar/CalendarLaneTimeGrid.svelte

sed -i 's/<CalendarTimeGrid\n                layout={lane.layout}/<CalendarTimeGrid\n                timeZone={timeZone}\n                layout={lane.layout}/g' client/src/components/calendar/CalendarLaneTimeGrid.svelte

# CalendarView
sed -i 's/<CalendarGanttChart\n            entries={placedEntries}/<CalendarGanttChart\n            timeZone={timeZone}\n            entries={placedEntries}/' client/src/components/calendar/CalendarView.svelte

sed -i 's/<CalendarMonthGrid\n            cells={monthCells}/<CalendarMonthGrid\n            timeZone={timeZone}\n            cells={monthCells}/' client/src/components/calendar/CalendarView.svelte

sed -i 's/<CalendarLaneTimeGrid\n            {lanes}/<CalendarLaneTimeGrid\n            timeZone={timeZone}\n            {lanes}/' client/src/components/calendar/CalendarView.svelte

sed -i 's/<CalendarTimeGrid\n            layout={timeGridLayout}/<CalendarTimeGrid\n            timeZone={timeZone}\n            layout={timeGridLayout}/' client/src/components/calendar/CalendarView.svelte
