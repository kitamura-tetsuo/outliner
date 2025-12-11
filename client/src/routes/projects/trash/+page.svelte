<script lang="ts">
    import { onMount } from "svelte";
    import { collection, query, where, getDocs, getFirestore } from "firebase/firestore";
    import { projectService } from "../../../services/projectService";
    import type { FirestoreProject } from "../../../types/project";
    import DeleteProjectDialog from "../../../components/DeleteProjectDialog.svelte";

    let deletedProjects = $state<FirestoreProject[]>([]);
    let projectToDelete: FirestoreProject | null = $state(null);

    onMount(async () => {
        const db = getFirestore();
        const q = query(collection(db, "projects"), where("deletedAt", "!=", null));
        const querySnapshot = await getDocs(q);
        deletedProjects = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreProject));
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
            await projectService.permanentlyDeleteProject(projectToDelete.id);
            deletedProjects = deletedProjects.filter(p => p.id !== projectToDelete.id);
            projectToDelete = null;
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

<table>
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
