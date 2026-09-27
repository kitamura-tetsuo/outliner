<script lang="ts">
import { onDestroy, onMount, untrack } from "svelte";
import { getNextDiagramInstanceId, initMermaid, renderMermaidDiagram, sanitizeSvg } from "../../services/diagram/diagramRenderer";

interface Props {
    id: string;
    source: string;
    mayRead: boolean;
}
let { id, source, mayRead }: Props = $props();

let currentRenderId = $state(0);
// Global counter for unique DOM IDs across instances (REQ-007)
let instanceId = $state(0);
let hasError = $state(false);
let errorMessage = $state("");
let renderedSvg = $state("");
let rootElement: HTMLDivElement | null = $state(null);

const MAX_SOURCE_LENGTH = 50000;

onMount(() => {
    initMermaid();
    instanceId = getNextDiagramInstanceId();
});

onDestroy(() => {
    // Invalidate already-started renders so a late settlement after this
    // occurrence unmounts (AS-005) cannot commit state here. Staging cleanup
    // is owned by renderMermaidDiagram's finally block either way.
    currentRenderId++;
});

$effect(() => {
    void id;
    void source;
    void mayRead;
    untrack(() => renderDiagram());
});

async function renderDiagram() {
    currentRenderId++;
    const renderId = currentRenderId;

    // Clear previous
    hasError = false;
    errorMessage = "";
    renderedSvg = "";

    if (!mayRead) {
        // REQ-011: Do not render if read capability is missing
        return;
    }

    if (!source || source.trim() === "") {
        return; // Empty placeholder rendered via markup
    }

    if (source.length > MAX_SOURCE_LENGTH) {
        hasError = true;
        errorMessage = `Error: Diagram source exceeds ${MAX_SOURCE_LENGTH} characters.`;
        return;
    }

    try {
        const diagramId = `mermaid-${id}-${instanceId}-${renderId}`;
        // Staging lives inside this block's own subtree and is removed on
        // settle, so failed attempts leave nothing outside it (REQ-001).
        const result = await renderMermaidDiagram(rootElement, diagramId, source);

        if (renderId !== currentRenderId || !mayRead) return; // Stale or access revoked

        // Render inert SVG using DOMPurify as an extra safety measure (REQ-008)
        renderedSvg = sanitizeSvg(result.svg);

        // DO NOT call bindFunctions to avoid callbacks (REQ-008)
    } catch (err: unknown) {
        if (renderId !== currentRenderId || !mayRead) return;
        hasError = true;
        errorMessage = `Mermaid syntax error: ${err instanceof Error ? err.message : String(err)}`;
    }
}
</script>

<div class="diagram-renderer" bind:this={rootElement}>
    {#if hasError}
        <div class="diagram-error">{errorMessage}</div>
    {:else if !source || source.trim() === ""}
        <div class="diagram-empty-placeholder">(empty diagram)</div>
    {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div class="diagram-container" data-testid="diagram-block-excerpt">{@html renderedSvg}</div>
    {/if}
</div>

<style>
.diagram-renderer {
    width: 100%;
    min-height: 2em;
}
.diagram-empty-placeholder {
    font-style: italic;
    color: #9ca3af;
}
.diagram-error {
    color: #ef4444;
    font-family: monospace;
    white-space: pre-wrap;
    padding: 0.5rem;
    border: 1px solid #fca5a5;
    border-radius: 4px;
    background: #fef2f2;
}
</style>
