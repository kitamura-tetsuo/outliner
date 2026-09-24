<script lang="ts">
// Entry point of the Mermaid Diagram feature (issue #5310): an embedded
// block inside an outliner item (componentType "diagram"). The item stores
// only the Diagram id (a transclusion); the Diagram itself — its one
// authoritative Y.Text source — lives in the project's `diagrams` map and
// survives independently of any page that transcludes it.
//
// Native source editing (issue #5311): while any local logical cursor targets
// this Diagram's source, every mounted occurrence shows that source and paints
// the same carets and source-internal selections; with none, the preview
// surface is shown. Painting is a projection only — it never creates a cursor
// or an input recipient, and switching presentation writes nothing. All
// offsets are canonical Y.Text offsets (UTF-16 code units).
//
// A pending/unavailable occurrence (its Diagram state not yet loaded, or a
// diagramId that never resolves) is shown as such — never as an empty
// Diagram, and never repaired by creating one (#5310 REQ-007).
import { onDestroy, onMount, untrack } from "svelte";
import { Project } from "$shared/app-schema";
import type { Item } from "../../schema/app-schema";
import { getItemDiagramId, observeItemDiagramId } from "../../services/diagram/diagramBinding";
import { type DiagramSummary, getDiagram, observeDiagrams } from "../../services/diagram/diagramService";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { searchItem } from "../../lib/cursor/CursorNavigationUtils";
import {
    canReadDiagramSource,
    diagramIdForItem,
    registerDiagramOccurrence,
} from "../../services/diagram/diagramEditing";
import { diagramComposition } from "../../services/diagram/diagramComposition.svelte";
import { buildSourceSegments, type SourceCaretMark, type SourceRangeMark } from "../../services/diagram/diagramSourceView";
import { offsetFromPoint } from "../../services/diagram/diagramSourceDom";
import { diagramPresenceStore } from "../../stores/DiagramPresenceStore.svelte";

interface ItemLike {
    ydoc: import("yjs").Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

interface Props {
    item: ItemLike & { id: string; componentType?: string; };
    isReadOnly?: boolean;
}

let { item, isReadOnly = false }: Props = $props();

let diagramId = $state<string | undefined>();
// Bumped by the Diagram registry observer so the $derived lookup re-reads.
let registryVersion = $state(0);
// Bumped whenever the editor overlay's cursors or selections change.
let overlayVersion = $state(0);
// Bumped whenever remote Diagram cursor presence changes (#5312).
let presenceVersion = $state(0);

const project = $derived(Project.fromDoc(item.ydoc));
const mayRead = $derived(canReadDiagramSource(project));
const diagram = $derived.by<DiagramSummary | undefined>(() => {
    void registryVersion;
    return mayRead && diagramId ? getDiagram(project, diagramId) : undefined;
});

/** The Diagram an item of the current page transcludes, if it is an occurrence. */
function diagramOfItem(itemId: string): string | undefined {
    const root = generalStore.currentPage as Item | undefined;
    const found = root ? searchItem(root, itemId) : undefined;
    return diagramIdForItem(found as Item | undefined);
}

/** Local logical cursors whose edit target is this Diagram's source. */
const sourceCursors = $derived.by(() => {
    void overlayVersion;
    void registryVersion;
    if (!diagramId) return [];
    return editorOverlayStore.getLocalCursorInstances().filter(cursor =>
        diagramIdForItem(cursor.findTarget()) === diagramId
    );
});

/**
 * Remote cursors addressed to this Diagram, resolved against the current
 * project doc — regardless of the page or occurrence they were placed
 * through (#5312 REQ-002/REQ-003). Painting is display-only: these never
 * become local input recipients or an editing lock.
 */
const remoteSourceCursors = $derived.by(() => {
    void presenceVersion;
    void registryVersion;
    if (!diagramId) return [];
    return diagramPresenceStore.resolvedEntriesFor(diagramId, project);
});

/**
 * Diagram source mode follows the union of local live cursors and accepted
 * remote live cursors, including one still pending its source/text evidence
 * (#5312 REQ-004) — `diagramPresenceStore.hasLiveFor` counts a pending entry
 * even when `remoteSourceCursors` above cannot yet paint it.
 */
const sourceVisible = $derived.by(() => {
    void presenceVersion;
    if (sourceCursors.length > 0) return true;
    return !!diagramId && diagramPresenceStore.hasLiveFor(diagramId);
});

/** Source-internal selections of any occurrence of this Diagram, in canonical offsets. */
const sourceRanges = $derived.by<SourceRangeMark[]>(() => {
    void overlayVersion;
    if (!diagramId) return [];
    const ranges: SourceRangeMark[] = [];
    for (const selection of Object.values(editorOverlayStore.selections)) {
        if ((selection.userId ?? "local") !== "local") continue;
        if (selection.start.kind !== "text" || selection.end.kind !== "text") continue;
        if (selection.start.itemId !== selection.end.itemId) continue;
        if (diagramOfItem(selection.start.itemId) !== diagramId) continue;
        ranges.push({ start: selection.start.offset, end: selection.end.offset });
    }
    for (const remote of remoteSourceCursors) {
        if (remote.selection) ranges.push({ start: remote.selection.start, end: remote.selection.end });
    }
    return ranges;
});

const segments = $derived.by(() => {
    void registryVersion;
    const source = diagram?.source ?? "";
    const preedits = diagramId ? diagramComposition.preeditsFor(diagramId) : [];
    const carets: SourceCaretMark[] = [
        ...sourceCursors.map(cursor => ({ key: cursor.cursorId, offset: cursor.offset })),
        ...remoteSourceCursors.map(remote => ({
            key: `remote:${remote.sessionId}:${remote.cursorId}`,
            offset: remote.offset,
            remote: true,
            color: remote.color,
        })),
    ];
    return buildSourceSegments(source, carets, sourceRanges, preedits);
});

const EXCERPT_LENGTH = 60;
const excerpt = $derived.by(() => {
    const source = diagram?.source ?? "";
    const firstLine = source.split("\n").find((line) => line.trim().length > 0) ?? "";
    const trimmed = firstLine.trim();
    if (!trimmed) return "(empty diagram)";
    return trimmed.length > EXCERPT_LENGTH ? `${trimmed.slice(0, EXCERPT_LENGTH)}…` : trimmed;
});

/**
 * Place a caret in this occurrence. A plain gesture retargets the single local
 * caret (clicking another occurrence moves the cursor, it never duplicates it);
 * Alt adds an independent logical cursor (REQ-012).
 */
function placeCaret(offset: number, addCursor: boolean): string {
    const cursorId = addCursor
        ? editorOverlayStore.addCursor({ itemId: item.id, offset, isActive: true, userId: "local" })
        : (editorOverlayStore.clearCursorAndSelection("local"),
            editorOverlayStore.placeLocalCaret({ itemId: item.id, offset }));
    // Keyboard input reaches the source through the shared hidden input bridge.
    editorOverlayStore.getTextareaRef()?.focus();
    return cursorId;
}

/** Keep focus on the shared input bridge rather than the preview button. */
function keepEditorFocus(event: PointerEvent) {
    event.preventDefault();
}

/** Clicking the preview/empty surface enters the source at its beginning (REQ-003). */
function enterSource(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!mayRead || !diagram) return;
    placeCaret(0, event.altKey);
}

let drag: { cursorId: string; anchor: number; } | undefined;

/** Pointer on visible source: caret at the hit-tested canonical position; drag selects. */
function onSourcePointerDown(event: PointerEvent) {
    if (event.button !== 0 || !mayRead || !diagram) return;
    event.preventDefault();
    event.stopPropagation();
    const root = event.currentTarget as HTMLElement;
    const offset = offsetFromPoint(root, event.clientX, event.clientY) ?? diagram.source.length;
    const cursorId = placeCaret(offset, event.altKey);
    drag = { cursorId, anchor: offset };
    root.setPointerCapture?.(event.pointerId);
}

function onSourcePointerMove(event: PointerEvent) {
    if (!drag || (event.buttons & 1) === 0) return;
    const root = event.currentTarget as HTMLElement;
    const focus = offsetFromPoint(root, event.clientX, event.clientY);
    const cursor = editorOverlayStore.cursorInstances.get(drag.cursorId);
    if (focus === undefined || !cursor || cursor.offset === focus) return;
    cursor.offset = focus;
    editorOverlayStore.setCursorSelection(
        drag.cursorId,
        focus === drag.anchor ? undefined : {
            startItemId: item.id,
            startOffset: Math.min(drag.anchor, focus),
            endItemId: item.id,
            endOffset: Math.max(drag.anchor, focus),
            userId: "local",
            isReversed: focus < drag.anchor,
        },
    );
    cursor.applyToStore();
}

function onSourcePointerUp(event: PointerEvent) {
    drag = undefined;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
}

function swallowClick(event: MouseEvent) {
    event.stopPropagation();
}

// A surface can turn read-only while this occurrence stays mounted (read-only
// presentation, demo reset). Mutations already read writability through the
// live getter registered below; this effect exists only because nothing else
// signals the transition, and a pending composition bound to this occurrence
// must be invalidated the moment write access disappears (REQ-014).
$effect(() => {
    if (isReadOnly) untrack(() => diagramComposition.occurrenceInvalidated(item.id));
});

// The occurrence id, captured at mount: a deleted Yjs node no longer reports its id.
let occurrenceId = "";
let unobserveItem: (() => void) | undefined;
let unobserveRegistry: (() => void) | undefined;
let unobserveOverlay: (() => void) | undefined;
let unobservePresence: (() => void) | undefined;
let unregisterOccurrence: (() => void) | undefined;

onMount(() => {
    occurrenceId = item.id;
    diagramId = getItemDiagramId(item);
    unregisterOccurrence = registerDiagramOccurrence(occurrenceId, () => !isReadOnly);
    unobserveOverlay = editorOverlayStore.subscribe(() => overlayVersion++);
    unobservePresence = diagramPresenceStore.subscribe(() => presenceVersion++);
    unobserveRegistry = observeDiagrams(project, () => {
        registryVersion++;
    });
    unobserveItem = observeItemDiagramId(item, () => {
        diagramId = getItemDiagramId(item);
    });
});

onDestroy(() => {
    unobserveRegistry?.();
    unobserveOverlay?.();
    unobservePresence?.();
    unregisterOccurrence?.();
    unobserveItem?.();
    // Unmounting the active occurrence clears the local editing targets anchored
    // to it without touching the Diagram source (REQ-005), and invalidates a
    // composition bound to it (REQ-014). Reflections elsewhere are unaffected.
    diagramComposition.occurrenceInvalidated(occurrenceId);
    for (const cursor of editorOverlayStore.getLocalCursorInstances()) {
        if (cursor.itemId === occurrenceId) editorOverlayStore.removeCursor(cursor.cursorId);
    }
    if (editorOverlayStore.getActiveItem() === occurrenceId) editorOverlayStore.setActiveItem(null);
});
</script>

<!-- Bound 1:1 to the resolved Diagram: keying on its id remounts the view if
     the occurrence is ever rebound to a different Diagram, instead of
     rebinding observers in place (AGENTS.md, "Yjs-bound components and
     Svelte key"). -->
{#key diagramId}
    {#if !diagramId}
        <div class="diagram-block diagram-block--pending" data-testid="diagram-block" data-diagram-state="unbound">
            <span class="diagram-icon" aria-hidden="true">◇</span><span class="diagram-label">Mermaid diagram unavailable</span>
        </div>
    {:else if !mayRead}
        <div class="diagram-block diagram-block--pending" data-testid="diagram-block" data-diagram-state="denied" data-diagram-id={diagramId}>
            <span class="diagram-icon" aria-hidden="true">◇</span><span class="diagram-label">Mermaid diagram unavailable</span>
        </div>
    {:else if !diagram}
        <div class="diagram-block diagram-block--pending" data-testid="diagram-block" data-diagram-state="pending" data-diagram-id={diagramId}>
            <span class="diagram-icon" aria-hidden="true">◇</span><span class="diagram-label">Loading Mermaid diagram…</span>
        </div>
    {:else if sourceVisible}
        <div class="diagram-block diagram-source-visible" data-testid="diagram-block" data-diagram-state="ready"
            data-diagram-id={diagram.id} data-diagram-format={diagram.format}>
            <!-- No whitespace between runs: the rendered text must be exactly the canonical source.
                 Keyboard input reaches the source through the shared hidden input bridge
                 (GlobalTextArea), not through this element; the click handler only keeps the
                 pointer gesture from reaching the outline row's own click handling. -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="diagram-source" data-testid="diagram-source" data-diagram-source role="textbox" tabindex="-1"
                aria-multiline="true" aria-readonly={isReadOnly} aria-label="Mermaid source"
                onpointerdown={onSourcePointerDown} onpointermove={onSourcePointerMove} onpointerup={onSourcePointerUp}
                onclick={swallowClick}
            >{#each segments as segment (segment.key)}{#if segment.kind === "text"}<span class="diagram-source-run" class:diagram-source-selected={segment.selected} data-source-run data-source-start={segment.start}>{segment.text}</span>{:else if segment.kind === "caret"}<span class="diagram-caret" class:diagram-caret--remote={segment.remote} data-testid={segment.remote ? "diagram-remote-caret" : "diagram-caret"} data-caret-offset={segment.offset} style={segment.color ? `color:${segment.color}` : undefined} aria-hidden="true"></span>{:else}<span class="diagram-preedit" data-testid="diagram-preedit" data-ephemeral>{segment.text}</span>{/if}{/each}</div>
        </div>
    {:else}
        <button type="button" class="diagram-block" data-testid="diagram-block" data-diagram-state="ready"
            data-diagram-id={diagram.id} data-diagram-format={diagram.format} onpointerdown={keepEditorFocus}
            onclick={enterSource}>
            <span class="diagram-icon" aria-hidden="true">◇</span><span class="diagram-label" data-testid="diagram-block-excerpt">{excerpt}</span>
        </button>
    {/if}
{/key}

<style>
.diagram-block {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fafafa;
    font-size: 0.875rem;
    text-align: left;
    width: 100%;
    color: #374151;
}

.diagram-block--pending {
    color: #9ca3af;
    font-style: italic;
}

.diagram-icon {
    color: #6366f1;
}

.diagram-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.diagram-source {
    flex: 1;
    min-height: 1.2em;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    cursor: text;
    outline: none;
}
.diagram-source-selected { background: rgba(99, 102, 241, 0.25); }
.diagram-preedit { text-decoration: underline; }
.diagram-caret { display: inline-block; width: 1px; height: 1.2em; margin-right: -1px; vertical-align: text-bottom; background: currentColor; animation: diagram-blink 1s step-end infinite; }
.diagram-caret--remote { width: 2px; animation: none; }
@keyframes diagram-blink { 50% { opacity: 0; } }
</style>
