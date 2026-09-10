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

interface ItemLike {
    ydoc: import("yjs").Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

interface Props {
    item: ItemLike;
}

let { item }: Props = $props();

let diagramId = $state<string | undefined>();
// Bumped by the Diagram registry observer so the $derived lookup re-reads.
let registryVersion = $state(0);

const project = $derived(Project.fromDoc(item.ydoc));
const diagram = $derived.by<DiagramSummary | undefined>(() => {
    void registryVersion;
    return diagramId ? getDiagram(project, diagramId) : undefined;
});

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

onMount(() => {
    diagramId = getItemDiagramId(item);
    unobserveRegistry = observeDiagrams(project, () => {
        registryVersion++;
    });
    unobserveItem = observeItemDiagramId(item, () => {
        diagramId = getItemDiagramId(item);
    });
});

onDestroy(() => {
    unobserveRegistry?.();
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
            <span class="diagram-icon" aria-hidden="true">◇</span>
            <span class="diagram-label">Mermaid diagram unavailable</span>
        </div>
    {:else if !diagram}
        <div
            class="diagram-block diagram-block--pending"
            data-testid="diagram-block"
            data-diagram-state="pending"
            data-diagram-id={diagramId}
        >
            <span class="diagram-icon" aria-hidden="true">◇</span>
            <span class="diagram-label">Loading Mermaid diagram…</span>
        </div>
    {:else}
        <div
            class="diagram-block"
            data-testid="diagram-block"
            data-diagram-state="ready"
            data-diagram-id={diagram.id}
            data-diagram-format={diagram.format}
        >
            <span class="diagram-icon" aria-hidden="true">◇</span>
            <span class="diagram-label" data-testid="diagram-block-excerpt">{excerpt}</span>
        </div>
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
</style>
