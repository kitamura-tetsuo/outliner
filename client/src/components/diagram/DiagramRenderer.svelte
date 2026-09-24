<script lang="ts">
import { onMount, untrack } from "svelte";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

interface Props {
    id: string;
    source: string;
}
let { id, source }: Props = $props();

let currentRenderId = $state(0);
let hasError = $state(false);
let errorMessage = $state("");
let renderedSvg = $state("");

const MAX_SOURCE_LENGTH = 50000;

onMount(() => {
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        maxEdges: 500, // REQ-009
    });
});

$effect(() => {
    void id;
    void source;
    untrack(() => renderDiagram());
});

async function renderDiagram() {
    currentRenderId++;
    const renderId = currentRenderId;

    // Clear previous
    hasError = false;
    errorMessage = "";
    renderedSvg = "";

    if (!source || source.trim() === "") {
        return; // Empty placeholder rendered via markup
    }

    if (source.length > MAX_SOURCE_LENGTH) {
        hasError = true;
        errorMessage = `Error: Diagram source exceeds ${MAX_SOURCE_LENGTH} characters.`;
        return;
    }

    try {
        const diagramId = `mermaid-${id}-${renderId}`;
        const result = await mermaid.render(diagramId, source);

        if (renderId !== currentRenderId) return; // Stale

        // Render inert SVG using DOMPurify as an extra safety measure (REQ-008)
        renderedSvg = DOMPurify.sanitize(result.svg);

        // DO NOT call bindFunctions to avoid callbacks (REQ-008)
    } catch (err: unknown) {
        if (renderId !== currentRenderId) return;
        hasError = true;
        errorMessage = `Mermaid syntax error: ${err instanceof Error ? err.message : String(err)}`;
    }
}
</script>

<div class="diagram-renderer">
    {#if hasError}
        <div class="diagram-error">{errorMessage}</div>
    {:else if !source || source.trim() === ""}
        <div class="diagram-empty-placeholder">(empty diagram)</div>
    {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div class="diagram-container">{@html renderedSvg}</div>
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
