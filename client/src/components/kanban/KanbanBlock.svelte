<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { getItemKanbanId, observeItemKanbanId, type KanbanPlacementItem } from "../../services/yjstable/kanbanBinding";
import { getKanbanHandles } from "../../services/yjstable/kanbanDocs";
import { projectKanbanRoute } from "../../lib/managementPaths";
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
                <!-- The typed resolver rejects an empty project identity, so
                     the action appears once the connected project is known. -->
                {#if projectId}
                    <a href={projectKanbanRoute(projectId, kanbanId)}>Open standalone board</a>
                {/if}
            {:else}
                <p role="alert" data-testid="kanban-missing">Kanban unavailable</p>
            {/if}
        {/key}
    {:else}
        <p role="alert" data-testid="kanban-missing">Kanban placement is not configured</p>
    {/if}
</div>
