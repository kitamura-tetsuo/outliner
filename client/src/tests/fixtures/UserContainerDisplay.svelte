<script lang="ts">
import { firestoreStore } from "../../stores/firestoreStore.svelte";
</script>
<div>
    <div data-testid="default">{firestoreStore.userContainer?.defaultContainerId}</div>
    <ul>
        {#if firestoreStore.userContainer?.accessibleContainerIds}
            {#each firestoreStore.userContainer.accessibleContainerIds as id}
                <li>{id}</li>
            {/each}
        {/if}
    </ul>
</div>
