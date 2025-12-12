<script lang="ts">
    import { onMount } from "svelte";
    import { collection, query, where, getDocs, getFirestore } from "firebase/firestore";
    import { projectService } from "../../../services/projectService";
    import { containerStore, type ContainerInfo } from "../../../stores/containerStore.svelte";
    import DeleteProjectDialog from "../../../components/DeleteProjectDialog.svelte";

    let projects = $state<Array<ContainerInfo>>([]);
    let projectToDelete: ContainerInfo | null = $state(null);
    let deletedProjectIds = $state<Set<string>>(new Set());

    async function loadDeletedProjectIds(): Promise<void> {
        try {
            const db = getFirestore();
            const q = query(collection(db, "projects"), where("deletedAt", "!=", null));
            const querySnapshot = await getDocs(q);
            deletedProjectIds = new Set(querySnapshot.docs.map(doc => doc.id));
        } catch {
            // If query fails, assume no deleted projects
            deletedProjectIds = new Set();
        }
    }

    function syncContainers(): void {
        const next = containerStore.containers;
        // Filter out deleted projects
        projects = next.filter(p => !deletedProjectIds.has(p.id));
    }

    onMount(async () => {
        await loadDeletedProjectIds();
        syncContainers();

        if (typeof window === "undefined") {
            return () => {};
        }

        const onContainerStoreUpdated = async () => {
            await loadDeletedProjectIds();
            syncContainers();
        };
        const onFirestoreUcChanged = async () => {
            await loadDeletedProjectIds();
            syncContainers();
        }; // test-only fallback event

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
            await projectService.deleteProject(projectToDelete.id, projectToDelete.name);
            projectToDelete = null;
            // Reload deleted project IDs and sync containers
            await loadDeletedProjectIds();
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
            onDelete={handleDelete}
            onCancel={() => (projectToDelete = null)}
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
                                onclick={() => openDeleteDialog(project)}
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
