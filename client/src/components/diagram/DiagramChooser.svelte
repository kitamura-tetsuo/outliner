<script lang="ts">
// "Insert transclusion" (issue #5310, REQ-003/REQ-004): pick an existing
// Diagram in the current project — including one with zero occurrences —
// and insert another occurrence of it. Nothing is created until Select is
// clicked; Cancel/Escape leaves project state untouched.
import { getProjectCapabilities } from "../../services/project/projectCapabilities";
import { readListDiagrams } from "../../services/diagram/diagramQueries";
import { diagramChooserStore } from "../../stores/DiagramChooserStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

let selectedId = $state<string | undefined>(undefined);

const EXCERPT_LENGTH = 48;

const diagrams = $derived.by(() => {
    const project = generalStore.project;
    if (!project) return [];
    const auth = { capabilities: getProjectCapabilities(project), surfaceWritable: true };
    const result = readListDiagrams(project, auth);
    return result.ok ? result.data : [];
});

function excerptOf(source: string): string {
    const firstLine = source.split("\n").find((line) => line.trim().length > 0) ?? "";
    const trimmed = firstLine.trim();
    if (!trimmed) return "(empty diagram)";
    return trimmed.length > EXCERPT_LENGTH ? `${trimmed.slice(0, EXCERPT_LENGTH)}…` : trimmed;
}

function confirm(diagramId: string) {
    diagramChooserStore.confirm(diagramId);
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        diagramChooserStore.hide();
    }
}
</script>

{#if diagramChooserStore.isVisible}
    <div
        class="diagram-chooser"
        role="dialog"
        aria-modal="true"
        aria-label="Insert transclusion"
        data-testid="diagram-chooser"
        onkeydown={handleKeydown}
        tabindex="-1"
    >
        <h2>Insert transclusion</h2>
        {#if diagrams.length === 0}
            <p class="diagram-chooser-empty" data-testid="diagram-chooser-empty">No Mermaid diagrams in this project yet.</p>
        {:else}
            <ul role="listbox" aria-label="Existing Mermaid diagrams">
                {#each diagrams as d (d.id)}
                    <li role="option" aria-selected={selectedId === d.id} class:selected={selectedId === d.id}>
                        <button
                            type="button"
                            data-testid="diagram-chooser-option"
                            data-diagram-id={d.id}
                            onclick={() => { selectedId = d.id; }}
                            ondblclick={() => confirm(d.id)}
                        >
                            <span class="diagram-chooser-excerpt">{excerptOf(d.source)}</span>
                            <span class="diagram-chooser-id">{d.id}</span>
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
        <div class="diagram-chooser-actions">
            <button type="button" data-testid="diagram-chooser-cancel" onclick={() => diagramChooserStore.hide()}>Cancel</button>
            <button
                type="button"
                data-testid="diagram-chooser-confirm"
                disabled={!selectedId}
                onclick={() => selectedId && confirm(selectedId)}
            >
                Insert
            </button>
        </div>
    </div>
{/if}

<style>
.diagram-chooser {
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 12px;
    z-index: 1000;
    max-height: 320px;
    width: 340px;
    overflow: auto;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.diagram-chooser h2 {
    margin: 0 0 8px;
    font-size: 0.95rem;
}

.diagram-chooser ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow: auto;
}

.diagram-chooser li button {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 6px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.85rem;
}

.diagram-chooser li.selected button {
    background-color: #e6f3ff;
}

.diagram-chooser-id {
    color: #9ca3af;
    font-size: 0.75rem;
}

.diagram-chooser-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
}
</style>
