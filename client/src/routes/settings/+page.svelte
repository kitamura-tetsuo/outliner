<script lang="ts">
    import { projectStore } from "../../stores/projectStore.svelte";
</script>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-8">Settings</h1>

    <section class="mb-8">
        <h2 class="text-2xl font-semibold mb-4">Projects</h2>
        {#if projectStore.projects.length === 0}
            <p class="text-gray-500">No projects found.</p>
        {:else}
            <ul class="space-y-2">
                {#each projectStore.projects as project (project.id)}
                    <li>
                        <a
                            href="/settings/{encodeURIComponent(project.name)}"
                            class="text-blue-600 hover:text-blue-800 hover:underline text-lg"
                        >
                            {project.name || project.id}
                        </a>
                        {#if project.isDefault}
                            <span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Default</span>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </section>
</div>
