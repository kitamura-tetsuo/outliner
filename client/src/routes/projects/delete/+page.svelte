<script lang="ts">
    import { onMount } from "svelte";
    import { projectService } from "../../../services/projectService";
    import { containerStore, type ContainerInfo } from "../../../stores/containerStore.svelte";
    import DeleteProjectDialog from "../../../components/DeleteProjectDialog.svelte";

    let projects = $state<Array<ContainerInfo>>([]);
    let projectToDelete: ContainerInfo | null = $state(null);

    function syncContainers(): void {
        const next = containerStore.containers;
        projects = next.length > 0 ? [...next] : [];
    }

    onMount(() => {
        syncContainers();

        if (typeof window === "undefined") {
            return () => {};
        }

        const onContainerStoreUpdated = () => syncContainers();
        const onFirestoreUcChanged = () => syncContainers(); // test-only fallback event

        window.addEventListener("container-store-updated", onContainerStoreUpdated);
        window.addEventListener("firestore-uc-changed", onFirestoreUcChanged);

        return () => {
            window.removeEventListener("container-store-updated", onContainerStoreUpdated);
            window.removeEventListener("firestore-uc-changed", onFirestoreUcChanged);
        };
    });

    function openDeleteDialog(project: ContainerInfo) {
        projectToDelete = project;
    }

    async function handleDelete() {
        if (projectToDelete) {
            await projectService.deleteProject(projectToDelete.id);
            projectToDelete = null;
            syncContainers();
        }
    }
</script>

<svelte:head>
    <title>Delete Projects</title>
</svelte:head>

<main class="p-4">
    <h1 class="text-2xl font-bold mb-4">Delete Projects</h1>

    {#if projectToDelete}
        <DeleteProjectDialog
            projectTitle={projectToDelete.name}
            message="This will move the project to the trash. It will be permanently deleted after 30 days."
            confirmText="Delete"
            on:delete={handleDelete}
            on:cancel={() => (projectToDelete = null)}
        />
    {/if}

    {#if projects.length > 0}
        <table class="min-w-full border mb-4">
            <thead>
                <tr>
                    <th>Title</th>
                    <th>ID</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {#each projects as project (project.id)}
                    <tr>
                        <td>{project.name || "(loading...)"}</td>
                        <td>{project.id}</td>
                        <td>
                            <button
                                class="bg-red-500 text-white px-4 py-2 rounded"
                                on:click={() => openDeleteDialog(project)}
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <p>No projects found.</p>
    {/if}
</main>
