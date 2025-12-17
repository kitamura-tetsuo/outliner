<script lang="ts">
    import { goto } from "$app/navigation";
    import { yjsStore } from "../../../../stores/yjsStore.svelte";
    import * as yjsService from "../../../../lib/yjsService.svelte";

    let errorMessage: string | null = null;
    let projectId = $derived(yjsStore.currentContainerId);

    async function handleDelete() {
        if (!projectId) {
            errorMessage = "Project ID not found.";
            return;
        }

        const success = await yjsService.deleteContainer(projectId);
        if (success) {
            await goto("/");
        } else {
            errorMessage = "Failed to delete the project. Please try again.";
        }
    }
</script>

<h2>Delete Project</h2>
<p>Are you sure you want to delete this project?</p>

{#if projectId}
    <button on:click={handleDelete}>Delete</button>
{:else}
    <p>Loading...</p>
{/if}

{#if errorMessage}
    <p style="color: red;">{errorMessage}</p>
{/if}
