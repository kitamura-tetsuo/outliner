<script lang="ts">
// Entry point of the Mermaid Diagram feature (issue #5310): an embedded
// block inside an outliner item (componentType "diagram"). The item stores
// only the Diagram id (a transclusion); the Diagram itself — its one
// authoritative Y.Text source — lives in the project's `diagrams` map and
// survives independently of any page that transcludes it.
//
// This stage renders a minimal typed placeholder only (REQ-002's Non-goals):
// native source editing and safe Mermaid rendering are owned by later
// siblings (#5311-#5314). A pending/unavailable occurrence (its Diagram
// state not yet loaded, or a diagramId that never resolves) is shown as
// such — never as an empty Diagram, and never repaired by creating one
// (REQ-007).
import { onDestroy, onMount } from "svelte";
import { Project } from "$shared/app-schema";
import { getItemDiagramId, observeItemDiagramId } from "../../services/diagram/diagramBinding";
import { type DiagramSummary, getDiagram, observeDiagrams } from "../../services/diagram/diagramService";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { getProjectCapabilities } from "../../services/project/projectCapabilities";
import { canReadDiagrams } from "../../services/diagram/diagramAuthorization";
import { diagramIdForItem, registerDiagramOccurrence } from "../../services/diagram/diagramEditing";

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
let cursorVersion = $state(0);

const project = $derived(Project.fromDoc(item.ydoc));
const mayRead = $derived(canReadDiagrams({ capabilities: getProjectCapabilities(project), surfaceWritable: false }));
const diagram = $derived.by<DiagramSummary | undefined>(() => {
    void registryVersion;
    return mayRead && diagramId ? getDiagram(project, diagramId) : undefined;
});
const sourceCursors = $derived.by(() => {
    void cursorVersion;
    if (!diagramId) return [];
    return editorOverlayStore.getLocalCursorInstances().filter(cursor => {
        const target = cursor.findTarget();
        return diagramIdForItem(target) === diagramId;
    });
});
const sourceVisible = $derived(sourceCursors.length > 0);
const sourceCharacters = $derived(Array.from(diagram?.source ?? ""));
function cursorsAt(offset: number) { return sourceCursors.filter(cursor => cursor.offset === offset); }

function hitTestOffset(event: MouseEvent): number {
    const element = event.currentTarget as HTMLElement;
    const position = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (!position?.offsetNode || !element.contains(position.offsetNode)) return 0;
    const range = document.createRange();
    range.setStart(element, 0);
    range.setEnd(position.offsetNode, position.offset);
    return Math.min(range.toString().length, diagram?.source.length ?? 0);
}
function enterSource(event: MouseEvent) {
    event.stopPropagation();
    if (!mayRead || !diagram) return;
    const offset = sourceVisible ? hitTestOffset(event) : 0;
    editorOverlayStore.placeLocalCaret({ itemId: item.id, offset });
}

const EXCERPT_LENGTH = 60;
const excerpt = $derived.by(() => {
    const source = diagram?.source ?? "";
    const firstLine = source.split("\n").find((line) => line.trim().length > 0) ?? "";
    const trimmed = firstLine.trim();
    if (!trimmed) return "(empty diagram)";
    return trimmed.length > EXCERPT_LENGTH ? `${trimmed.slice(0, EXCERPT_LENGTH)}…` : trimmed;
});

let unobserveItem: (() => void) | undefined;
let unobserveRegistry: (() => void) | undefined;
let unobserveCursors: (() => void) | undefined;
let unregisterOccurrence: (() => void) | undefined;

onMount(() => {
    diagramId = getItemDiagramId(item);
    unregisterOccurrence = registerDiagramOccurrence(item.id, !isReadOnly);
    unobserveCursors = editorOverlayStore.subscribe(() => cursorVersion++);
    unobserveRegistry = observeDiagrams(project, () => {
        registryVersion++;
    });
    unobserveItem = observeItemDiagramId(item, () => {
        diagramId = getItemDiagramId(item);
    });
});

onDestroy(() => {
    unobserveRegistry?.();
    unobserveCursors?.();
    unregisterOccurrence?.();
    unobserveItem?.();
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
    {:else}
        <button type="button" class="diagram-block" class:diagram-source-visible={sourceVisible} data-testid="diagram-block"
            data-diagram-state="ready" data-diagram-id={diagram.id} data-diagram-format={diagram.format} onclick={enterSource}>
            {#if sourceVisible}
                <code class="diagram-source" data-testid="diagram-source">{#each sourceCharacters as character, index}{#each cursorsAt(index) as cursor (cursor.cursorId)}<span class="diagram-caret" aria-hidden="true"></span>{/each}{character}{/each}{#each cursorsAt(sourceCharacters.length) as cursor (cursor.cursorId)}<span class="diagram-caret" aria-hidden="true"></span>{/each}</code>
            {:else}
                <span class="diagram-icon" aria-hidden="true">◇</span><span class="diagram-label" data-testid="diagram-block-excerpt">{excerpt}</span>
            {/if}
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

.diagram-source { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.diagram-caret { display: inline-block; width: 1px; height: 1.2em; margin-right: -1px; vertical-align: text-bottom; background: currentColor; animation: diagram-blink 1s step-end infinite; }
@keyframes diagram-blink { 50% { opacity: 0; } }
</style>
