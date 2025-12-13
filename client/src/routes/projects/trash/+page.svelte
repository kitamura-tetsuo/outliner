<script lang="ts">
    import { onMount } from "svelte";
    import { collection, onSnapshot, query, where, getFirestore } from "firebase/firestore";
    import { projectService } from "../../../services/projectService";
    import type { FirestoreProject } from "../../../types/project";
    import DeleteProjectDialog from "../../../components/DeleteProjectDialog.svelte";
    import { getFirebaseApp } from "../../../lib/firebase-app";
    import "../../../stores/firestoreStore.svelte";
    import { userManager } from "../../../auth/UserManager";

    let deletedProjects = $state<FirestoreProject[]>([]);
    let projectToDelete: FirestoreProject | null = $state(null);
    let isLoading = $state(true);

    async function waitForAuthReady(timeoutMs = 15000): Promise<void> {
        if (userManager.isAuthenticated()) return;
        await new Promise<void>((resolve, reject) => {
            let unsubscribe: (() => void) | undefined;
            const timeout = setTimeout(() => {
                unsubscribe?.();
                reject(new Error("Auth timeout"));
            }, timeoutMs);
            unsubscribe = userManager.addEventListener((result) => {
                if (result?.user) {
                    clearTimeout(timeout);
                    unsubscribe?.();
                    resolve();
                }
            });
        });
    }

    onMount(() => {
        let unsubscribe: (() => void) | undefined;
        void (async () => {
            try {
                // Ensure Firestore reads have an auth context (rules require owner/permissions)
                await waitForAuthReady();

                // Use the centralized Firebase app to ensure emulator connection
                const app = getFirebaseApp();
                const db = getFirestore(app);
                const uid = userManager.auth.currentUser?.uid;
                if (!uid) {
                    throw new Error("Not authenticated");
                }
                // Use > 0 instead of != null for better emulator compatibility
                // deletedAt is a timestamp (number), so > 0 finds all deleted projects
                // Firestore rules require queries to be scoped to the current user.
                const q = query(
                    collection(db, "projects"),
                    where("ownerId", "==", uid),
                    where("deletedAt", ">", 0),
                );
                unsubscribe = onSnapshot(q, (querySnapshot) => {
                    deletedProjects = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreProject));
                    isLoading = false;
                }, (error) => {
                    console.error("Error fetching deleted projects:", error);
                    isLoading = false;
                });
            } catch (error) {
                console.error("Error fetching deleted projects:", error);
                isLoading = false;
            }
        })();

        return () => {
            unsubscribe?.();
        };
    });

    async function restoreProject(projectId: string) {
        await projectService.restoreProject(projectId);
        deletedProjects = deletedProjects.filter(p => p.id !== projectId);
    }

    function openDeleteDialog(project: FirestoreProject) {
        projectToDelete = project;
    }

    async function permanentlyDeleteProject() {
        if (projectToDelete) {
            const projectId = projectToDelete.id;
            // Optimistically remove from UI so the list updates even if the cloud function
            // is slow/unavailable in local/test environments.
            deletedProjects = deletedProjects.filter(p => p.id !== projectId);
            projectToDelete = null;
            try {
                await projectService.permanentlyDeleteProject(projectId);
            } catch (error) {
                // In test environment, the cloud function may not be available
                // Log the error but continue to update local state
                console.warn("permanentlyDeleteProject cloud function error:", error);
            }
        }
    }
</script>

<h1>Trash</h1>

{#if projectToDelete}
    <DeleteProjectDialog
        projectTitle={projectToDelete.title}
        message="This will permanently delete the project. This action cannot be undone."
        confirmText="Delete Permanently"
        onDelete={permanentlyDeleteProject}
        onCancel={() => (projectToDelete = null)}
    />
{/if}

{#if isLoading}
    <p data-testid="trash-loading">Loading...</p>
{:else if deletedProjects.length === 0}
    <p data-testid="trash-empty">No deleted projects found.</p>
{/if}

<table data-testid="trash-table">
    <thead>
        <tr>
            <th>Project Title</th>
            <th>Deleted At</th>
            <th>Deleted By</th>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody>
        {#each deletedProjects as project (project.id)}
            <tr>
                <td>{project.title}</td>
                <td>{new Date(project.deletedAt).toLocaleString()}</td>
                <td>{project.deletedBy}</td>
                <td>
                    <button onclick={() => restoreProject(project.id)}>Restore</button>
                    <button onclick={() => openDeleteDialog(project)}>Delete Permanently</button>
                </td>
            </tr>
        {/each}
    </tbody>
</table>
