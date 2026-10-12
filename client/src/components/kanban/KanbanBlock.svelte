<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { getItemKanbanId, observeItemKanbanId, type KanbanPlacementItem } from "../../services/yjstable/kanbanBinding";
import { getKanbanHandles } from "../../services/yjstable/kanbanDocs";
import KanbanBoard from "./KanbanBoard.svelte";

interface Props { item: KanbanPlacementItem & { ydoc: import("yjs").Doc; }; isReadOnly?: boolean; }
let { item, isReadOnly = false }: Props = $props();
let kanbanId = $state<string | undefined>();
let stop: (() => void) | undefined;
const projectId = $derived(yjsStore.currentProjectId ?? undefined);
onMount(() => {
    kanbanId = getItemKanbanId(item);
    stop = observeItemKanbanId(item, () => kanbanId = getItemKanbanId(item));
});
onDestroy(() => stop?.());
</script>

<div class="kanban-placement" data-testid="kanban-placement" role="presentation">
    {#if kanbanId}
        {#key `${item.ydoc.guid}:${kanbanId}`}
            {@const handles = getKanbanHandles(item.ydoc, kanbanId)}
            {#if handles}
                <KanbanBoard projectDoc={item.ydoc} {projectId} kanban={handles} {isReadOnly} />
                <a href={`/${encodeURIComponent(projectId ?? "")}/-/kanbans/${encodeURIComponent(kanbanId)}`}>Open standalone board</a>
            {:else}
                <p role="alert" data-testid="kanban-missing">Kanban unavailable</p>
            {/if}
        {/key}
    {:else}
        <p role="alert" data-testid="kanban-missing">Kanban placement is not configured</p>
    {/if}
</div>
