<script lang="ts">
    import { onMount } from "svelte";
    import { collection, query, where, getDocs, getFirestore } from "firebase/firestore";
    import { projectService } from "../../../services/projectService";
    import { containerStore, type ContainerInfo } from "../../../stores/containerStore.svelte";
    import DeleteProjectDialog from "../../../components/DeleteProjectDialog.svelte";
    import { getFirebaseApp } from "../../../lib/firebase-app";
    import "../../../stores/firestoreStore.svelte";
    import { userManager } from "../../../auth/UserManager";

    let projects = $state<Array<ContainerInfo>>([]);
    let projectToDelete: ContainerInfo | null = $state(null);
    let deletedProjectIds = $state<Set<string>>(new Set());

    async function loadDeletedProjectIds(): Promise<void> {
        try {
            const uid = userManager.auth.currentUser?.uid;
            if (!uid) {
                deletedProjectIds = new Set();
                return;
            }

            // Use the centralized Firebase app to ensure emulator connection
            const app = getFirebaseApp();
            const db = getFirestore(app);
            // Use > 0 instead of != null for better emulator compatibility
            const q = query(
                collection(db, "projects"),
                where("ownerId", "==", uid),
                where("deletedAt", ">", 0),
            );
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

    onMount(() => {
        // Sync immediately from whatever the containerStore currently has.
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

        // Load deleted IDs after listeners are attached so no updates are missed.
        void (async () => {
            await loadDeletedProjectIds();
            syncContainers();
        })();

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
            try {
                await projectService.deleteProject(projectToDelete.id, projectToDelete.name);
            } catch (e) {
                console.error("Failed to delete project:", e);
            }
            // Always close the dialog, even if delete failed
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
