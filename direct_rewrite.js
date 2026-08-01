import fs from 'fs';

function applyTimeGrid() {
    let p = 'client/src/components/calendar/CalendarTimeGrid.svelte';
    let lines = fs.readFileSync(p, 'utf8').split('\n');
    let out = [];

    let inProps = false;
    let inDragState = false;

    for (let i=0; i<lines.length; i++) {
        let line = lines[i];

        if (line.includes('import CalendarEntryCard')) {
            out.push(line);
            out.push('import CalendarDragTooltip from "./CalendarDragTooltip.svelte";');
            out.push('import { formatDragMoveLabel, formatDragResizeLabel } from "../../services/calendar/calendarDragLabel";');
            continue;
        }

        if (line.includes('interface Props {')) {
            inProps = true;
        }

        if (inProps && line.includes('}')) {
            inProps = false;
            out.push('    timeZone: string;');
            out.push(line);
            continue;
        }

        if (line.includes('}: Props = $props();')) {
            line = line.replace('}: Props', ', timeZone }: Props');
        }

        if (line.includes('let drag = $state<')) {
            inDragState = true;
            out.push(`let drag = $state<{
    kind: "move" | "resize"
    entry: CalendarEntry
    pointerId: number
    startClientX: number
    startClientY: number
    originStartMs: number
    originDurationMs: number
    label?: string
    clientX?: number
    clientY?: number
} | undefined>(undefined);`);
            continue;
        }

        if (inDragState) {
            if (line.includes('} | undefined')) {
                // Done skipping the original state
                i++; // skip `>();` or `>(undefined);`
                inDragState = false;
            }
            continue;
        }

        if (line.includes('drag = {')) {
            out.push(line);
            continue;
        }
        if (line.includes('kind: "move"') || line.includes('kind: "resize"')) {
            out.push(line);
            continue;
        }
        // inject client properties where originDurationMs is set
        if (line.includes('originDurationMs:')) {
            out.push(line);
            out.push('            clientX: e.clientX,');
            out.push('            clientY: e.clientY,');
            continue;
        }

        if (line.includes('if (!drag) return;')) {
            out.push(line);
            out.push('        drag.clientX = e.clientX;');
            out.push('        drag.clientY = e.clientY;');
            continue;
        }

        if (line.includes('onDragMove?.(drag.entry.sourceId, newStartMs);')) {
            out.push(line);
            out.push('            drag.label = formatDragMoveLabel(drag.entry as any, newStartMs, timeZone);');
            continue;
        }

        if (line.includes('onResizeMove?.(drag.entry.sourceId, newDurationMs);')) {
            out.push(line);
            out.push('            drag.label = formatDragResizeLabel(drag.entry as any, newDurationMs, timeZone);');
            continue;
        }

        if (line.includes('</style>')) {
            // We append the tooltip just before the closing </div> of the main wrapper
            // But doing it before <style> works if we replace the last `</div>`
        }

        out.push(line);
    }

    let text = out.join('\n');
    text = text.replace(/    <\/div>\n<\/div>\n\n<style>/,
    `    </div>\n    {#if drag && drag.label && drag.clientX !== undefined && drag.clientY !== undefined}\n        <CalendarDragTooltip label={drag.label} clientX={drag.clientX} clientY={drag.clientY} />\n    {/if}\n</div>\n\n<style>`);

    fs.writeFileSync(p, text);
}

function applyGantt() {
    let p = 'client/src/components/calendar/CalendarGanttChart.svelte';
    let lines = fs.readFileSync(p, 'utf8').split('\n');
    let out = [];

    let inProps = false;
    let inDragState = false;

    for (let i=0; i<lines.length; i++) {
        let line = lines[i];

        if (line.includes('import { scaleToViewRange }')) {
            out.push(line);
            out.push('import CalendarDragTooltip from "./CalendarDragTooltip.svelte";');
            out.push('import { formatDragMoveLabel, formatDragResizeLabel, formatSubtreeShiftLabel } from "../../services/calendar/calendarDragLabel";');
            continue;
        }

        if (line.includes('interface Props {')) {
            inProps = true;
        }

        if (inProps && line.includes('}')) {
            inProps = false;
            out.push('    timeZone: string;');
            out.push(line);
            continue;
        }

        if (line.includes('}: Props = $props();')) {
            out.push('    timeZone,');
        }

        // Svelte 5 state is tricky, let's just replace type Drag = ...
        if (line.includes('type Drag =')) {
            out.push(`type Drag =
    | { kind: "leaf-move"; row: GanttRow; pointerId: number; startClientX: number; originStartMs: number; label?: string; clientX?: number; clientY?: number; }
    | { kind: "leaf-resize"; row: GanttRow; pointerId: number; startClientX: number; originDurationMs: number; label?: string; clientX?: number; clientY?: number; }
    | {
        kind: "subtree-move";
        row: GanttRow;
        pointerId: number;
        startClientX: number;
        analysis: GanttSubtreeShiftAnalysis;
        label?: string;
        clientX?: number;
        clientY?: number;
    };`);
            // skip until the end of the type
            while (!lines[i].includes('};') && !lines[i].includes('} | undefined')) {
                i++;
            }
            if (lines[i].includes('};')) {
                // done
            }
            continue;
        }

        if (line.includes('originStartMs:') || line.includes('originDurationMs:') || line.includes('analysis,')) {
            // inside pointerTracker assignments
            out.push(line);
            if (lines[i+1].includes('};')) {
                out.push('            clientX: e.clientX,');
                out.push('            clientY: e.clientY,');
            }
            continue;
        }

        if (line.includes('pointerTracker.previewDeltaMs = snappedDeltaMs;')) {
            out.push(line);
            out.push('        pointerTracker.clientX = e.clientX;');
            out.push('        pointerTracker.clientY = e.clientY;');
            continue;
        }

        if (line.includes('onLeafDragMove?.(')) {
            out.push(line);
            out.push('            pointerTracker.label = formatDragMoveLabel(entry as any, newStartMs, timeZone);');
            continue;
        }

        if (line.includes('onLeafResizeMove?.(')) {
            out.push(line);
            out.push('            pointerTracker.label = formatDragResizeLabel(entry as any, newDurationMs, timeZone);');
            continue;
        }

        if (line.includes('// Shift previews are not currently sent up')) {
            out.push(line);
            out.push('            pointerTracker.label = formatSubtreeShiftLabel(snappedDeltaMs, pointerTracker.originalMs + snappedDeltaMs, timeZone);');
            continue;
        }

        out.push(line);
    }

    let text = out.join('\n');
    text = text.replace(/    <\/div>\n<\/div>\n\n<style>/,
    `    </div>\n    {#if drag && drag.label && drag.clientX !== undefined && drag.clientY !== undefined}\n        <CalendarDragTooltip label={drag.label} clientX={drag.clientX} clientY={drag.clientY} />\n    {/if}\n</div>\n\n<style>`);

    fs.writeFileSync(p, text);
}

function applyMonthGrid() {
    let p = 'client/src/components/calendar/CalendarMonthGrid.svelte';
    let lines = fs.readFileSync(p, 'utf8').split('\n');
    let out = [];

    let inProps = false;

    for (let i=0; i<lines.length; i++) {
        let line = lines[i];

        if (line.includes('import CalendarEntryCard from')) {
            out.push(line);
            out.push('import CalendarDragTooltip from "./CalendarDragTooltip.svelte";');
            out.push('import { formatDragMoveLabel } from "../../services/calendar/calendarDragLabel";');
            continue;
        }

        if (line.includes('interface Props {')) {
            inProps = true;
        }

        if (inProps && line.includes('}')) {
            inProps = false;
            out.push('    timeZone: string;');
            out.push(line);
            continue;
        }

        if (line.includes('}: Props = $props();')) {
            line = line.replace('}: Props', ', timeZone }: Props');
        }

        if (line.includes('let isAnyDragActive = $state(false);')) {
            out.push(line);
            out.push('let dragTooltip = $state<{ label: string, clientX: number, clientY: number } | undefined>();');
            continue;
        }

        if (line.includes('isAnyDragActive = true;')) {
            out.push(line);
            out.push('        dragTooltip = undefined;');
            continue;
        }

        if (line.includes('e.dataTransfer.dropEffect = "move";')) {
            out.push(line);
            out.push('        }'); // close the if block
            out.push(`
        try {
            if (dragSourceId) {
                let draggedEntry: any;
                for (const cell of cells) {
                    for (const row of cell.rowSlots) {
                        if (row && (row as any).sourceId === dragSourceId) {
                            draggedEntry = row;
                            break;
                        }
                    }
                    if (draggedEntry) break;
                }
                if (draggedEntry) {
                    dragTooltip = {
                        label: formatDragMoveLabel(draggedEntry, cellDateMs, timeZone),
                        clientX: e.clientX,
                        clientY: e.clientY
                    };
                }
            }
        } catch (err) {}`);
            i++; // skip the original '}'
            continue;
        }

        if (line.includes('isAnyDragActive = false;')) {
            out.push(line);
            out.push('        dragTooltip = undefined;');
            continue;
        }

        if (line.includes('function onDrop(')) {
            out.push(line);
            out.push('        dragTooltip = undefined;');
            continue;
        }

        if (line.includes('function onDragLeave() {')) {
            out.push(line);
            out.push('        dragTooltip = undefined;');
            continue;
        }

        out.push(line);
    }

    let text = out.join('\n');
    text = text.replace(/    <\/div>\n<\/div>\n\n<style>/,
    `    </div>\n    {#if dragTooltip}\n        <CalendarDragTooltip label={dragTooltip.label} clientX={dragTooltip.clientX} clientY={dragTooltip.clientY} />\n    {/if}\n</div>\n\n<style>`);

    fs.writeFileSync(p, text);
}

function applyLaneGrid() {
    let p = 'client/src/components/calendar/CalendarLaneTimeGrid.svelte';
    let lines = fs.readFileSync(p, 'utf8').split('\n');
    let out = [];

    let inProps = false;

    for (let i=0; i<lines.length; i++) {
        let line = lines[i];

        if (line.includes('interface Props {')) {
            inProps = true;
        }

        if (inProps && line.includes('}')) {
            inProps = false;
            out.push('    timeZone: string;');
            out.push(line);
            continue;
        }

        if (line.includes('}: Props = $props();')) {
            line = line.replace('}: Props', ', timeZone }: Props');
        }

        if (line.includes('<CalendarTimeGrid')) {
            out.push(line);
            out.push('                timeZone={timeZone}');
            continue;
        }

        out.push(line);
    }

    fs.writeFileSync(p, out.join('\n'));
}

function applyView() {
    let p = 'client/src/components/calendar/CalendarView.svelte';
    let lines = fs.readFileSync(p, 'utf8').split('\n');
    let out = [];

    for (let i=0; i<lines.length; i++) {
        let line = lines[i];

        if (line.includes('<CalendarGanttChart') || line.includes('<CalendarMonthGrid') || line.includes('<CalendarLaneTimeGrid') || line.includes('<CalendarTimeGrid')) {
            out.push(line);
            out.push('            timeZone={timeZone}');
            continue;
        }

        out.push(line);
    }

    fs.writeFileSync(p, out.join('\n'));
}

applyTimeGrid();
applyGantt();
applyMonthGrid();
applyLaneGrid();
applyView();
