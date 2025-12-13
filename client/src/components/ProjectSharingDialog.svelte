<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { projectService } from "../../services/projectService";

    export let project: { id: string; title: string; isPublic?: boolean; publicAccessToken?: string };
    export let isOpen: boolean;

    let isPublic = project.isPublic ?? false;
    let publicUrl = "";

    const dispatch = createEventDispatcher();

    function close() {
        dispatch("close");
    }

    async function togglePublic() {
        const token = await projectService.togglePublic(project.id, isPublic);
        project.isPublic = isPublic;
        project.publicAccessToken = token ?? undefined;
        if (isPublic) {
            publicUrl = `${window.location.origin}/${project.title}?token=${project.publicAccessToken}`;
        } else {
            publicUrl = "";
        }
    }

    function copyUrl() {
        navigator.clipboard.writeText(publicUrl);
    }

    $: if (isOpen && project.isPublic && project.publicAccessToken) {
        publicUrl = `${window.location.origin}/${project.title}?token=${project.publicAccessToken}`;
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" on:click={close}>
        <div class="rounded-lg bg-white p-6 shadow-xl" on:click|stopPropagation>
            <h2 class="mb-4 text-lg font-bold">Share "{project.title}"</h2>

            <div class="mb-4 flex items-center">
                <label for="public-toggle" class="mr-2">Public</label>
                <input type="checkbox" id="public-toggle" bind:checked={isPublic} on:change={togglePublic} />
            </div>

            {#if isPublic}
                <div class="mb-4">
                    <p class="text-sm text-gray-600">Anyone with the link can view</p>
                    <div class="flex items-center">
                        <input type="text" readonly bind:value={publicUrl} class="w-full rounded-l-md border p-2" />
                        <button on:click={copyUrl} class="rounded-r-md bg-blue-500 px-4 py-2 text-white">Copy</button>
                    </div>
                </div>
            {/if}

            <button on:click={close} class="rounded-md bg-gray-300 px-4 py-2">Close</button>
        </div>
    </div>
{/if}
