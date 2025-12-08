<script lang="ts">
    import { projectListStore } from "../../stores/projectListStore.svelte";
    import ProjectCard from "$lib/components/ProjectCard.svelte";
    import RenameProjectDialog from "$lib/components/RenameProjectDialog.svelte";
    import ShareProjectDialog from "$lib/components/ShareProjectDialog.svelte";
    import DeleteProjectDialog from "../../components/DeleteProjectDialog.svelte";
    import { createNewYjsProject } from "../../services";
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { getLogger } from "$lib/logger";
    import { userManager } from "../../auth/UserManager";
    import type { ProjectMetadata } from "../../stores/projectListStore.svelte";

    const logger = getLogger("ProjectListPage");

    let searchQuery = $state("");
    let filterType = $state("all"); // all, owner, shared, public
    let sortType = $state("updated"); // updated, created, name

    // Dialog states
    let renameDialogProject = $state<ProjectMetadata | null>(null);
    let shareDialogProject = $state<ProjectMetadata | null>(null);
    let deleteDialogProject = $state<ProjectMetadata | null>(null);
    let isCreating = $state(false);

    const currentUser = userManager.getCurrentUser();

    let filteredProjects = $derived(
        Object.values(projectListStore.projects)
            .filter((p) => {
                // Search filter
                if (searchQuery) {
                    const query = searchQuery.toLowerCase();
                    if (!p.title.toLowerCase().includes(query)) return false;
                }

                // Type filter
                if (filterType === "owner") {
                    return p.ownerId === currentUser?.id;
                } else if (filterType === "shared") {
                    return p.ownerId !== currentUser?.id;
                } else if (filterType === "public") {
                    return p.isPublic;
                }
                return true;
            })
            .sort((a, b) => {
                if (sortType === "name") {
                    return a.title.localeCompare(b.title);
                } else if (sortType === "created") {
                    return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
                } else {
                    // updated (default)
                    return (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0);
                }
            })
    );

    async function handleCreateNew() {
        try {
            isCreating = true;
            // Generate a random title or ask user? Defaulting to "Untitled Project" + timestamp logic inside createNewYjsProject usually?
            // createNewYjsProject takes (title, [lines])
            const title = `Untitled Project ${new Date().toLocaleDateString()}`;
            const client = await createNewYjsProject(title);

            // Navigate to new project
            if (client) {
                // Assuming client has getProject() or we can just navigate to /{title} or /{id}
                // Usually titles are unique in Yjs logic or mapped.
                // But wait, URL is /{title}.
                goto(resolve(`/${title}`));
            }
        } catch (e) {
            logger.error("Failed to create new project", e);
            alert("Failed to create new project");
        } finally {
            isCreating = false;
        }
    }

    function handleRename(project: ProjectMetadata) {
        renameDialogProject = project;
    }

    function handleDelete(project: ProjectMetadata) {
        deleteDialogProject = project;
    }

    function handleShare(project: ProjectMetadata) {
        shareDialogProject = project;
    }

    function handleOpen(project: ProjectMetadata) {
        // Navigate to project page
        // Note: URL is /:project (title based currently) or /:id?
        // Existing logic uses title in URL.
        goto(resolve(`/${project.title}`));
    }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 pb-10 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
            <div class="flex items-center gap-4">
                <a
                    href={resolve("/projects/trash")}
                    class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm font-medium"
                >
                    Trash
                </a>
                <button
                    onclick={handleCreateNew}
                    disabled={isCreating}
                    class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    {isCreating ? "Creating..." : "New Project"}
                </button>
            </div>
        </div>

        <!-- Filters & Search -->
        <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
            <div class="flex flex-col sm:flex-row gap-4 justify-between">
                <div class="flex-1 max-w-lg relative">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Search projects..."
                        class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-gray-100"
                    />
                </div>

                <div class="flex gap-4">
                    <select
                        bind:value={filterType}
                        class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                        <option value="all">All Projects</option>
                        <option value="owner">Owned by me</option>
                        <option value="shared">Shared with me</option>
                        <option value="public">Public</option>
                    </select>

                    <select
                        bind:value={sortType}
                        class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                        <option value="updated">Last Modified</option>
                        <option value="created">Created Date</option>
                        <option value="name">Name</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Project Grid -->
        {#if filteredProjects.length === 0}
            <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
                <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No projects found</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Get started by creating a new project.</p>
                <div class="mt-6">
                    <button
                        onclick={handleCreateNew}
                        class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Create Project
                    </button>
                </div>
            </div>
        {:else}
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {#each filteredProjects as project (project.containerId)}
                    <ProjectCard
                        {project}
                        onRename={handleRename}
                        onDelete={handleDelete}
                        onShare={handleShare}
                        onOpen={handleOpen}
                    />
                {/each}
            </div>
        {/if}
    </div>

    <!-- Dialogs -->
    {#if renameDialogProject}
        <RenameProjectDialog
            containerId={renameDialogProject.containerId}
            currentTitle={renameDialogProject.title}
            onClose={() => renameDialogProject = null}
            onSuccess={() => renameDialogProject = null}
        />
    {/if}

    {#if shareDialogProject}
        <ShareProjectDialog
            containerId={shareDialogProject.containerId}
            projectTitle={shareDialogProject.title}
            onClose={() => shareDialogProject = null}
        />
    {/if}

    {#if deleteDialogProject}
        <DeleteProjectDialog
            projectTitle={deleteDialogProject.title}
            onConfirm={async () => {
                // Logic to delete is in DeleteProjectDialog?
                // Wait, DeleteProjectDialog as seen earlier takes onConfirm
                // but doesn't implement deletion itself?
                // Let's check DeleteProjectDialog source again.
                // It calls onConfirm passed prop.
                // So I need to implement deletion logic here.

                try {
                    const { deleteProject } = await import("../../services/projectService");
                    if (deleteDialogProject) {
                        await deleteProject(deleteDialogProject.containerId);
                        deleteDialogProject = null;
                        // Store should auto-update via Firestore listener
                    }
                } catch (e) {
                    logger.error("Failed to delete", e);
                    alert("Failed to delete project");
                }
            }}
            onCancel={() => deleteDialogProject = null}
        />
    {/if}
</div>
