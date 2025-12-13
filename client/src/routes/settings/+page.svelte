<script lang="ts">
    import { browser } from "$app/environment";
    import { store } from "../../stores/store.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import * as yjsService from "../../lib/yjsService.svelte";
    import { Project } from "../../schema/app-schema";
    import { onMount } from "svelte";

    let newProjectName = $state("");
    // Check sessionStorage for test environment to get project name
    const storedProjectName = $derived(
        browser ? window.sessionStorage?.getItem("TEST_CURRENT_PROJECT_NAME") : undefined,
    );

    // Track project title changes explicitly
    let projectTitle = $state("");
    $effect(() => {
        if (store.project) {
            projectTitle = store.project.title || "";
        }
    });
    const currentProjectTitle = $derived(projectTitle);
    const currentProjectName = $derived(
        currentProjectTitle || storedProjectName || "",
    );
    const hasActiveProject = $derived(!!(storedProjectName || (store.project && currentProjectTitle && currentProjectTitle !== "settings")));

    // Initialize newProjectName when the component mounts or the project changes.
    $effect(() => {
        newProjectName = currentProjectName;
    });

    // On mount, ensure store has a project if we have a stored project name
    onMount(() => {
        if (browser && storedProjectName && !store.project) {
            const provisionalProject = Project.createInstance(storedProjectName);
            store.project = provisionalProject;
            projectTitle = storedProjectName;
        } else if (store.project) {
            projectTitle = store.project.title || "";
        }
    });

    async function handleRename() {
        if (!hasActiveProject) {
            return;
        }
        if (newProjectName && newProjectName !== currentProjectName) {
            try {
                // Try with YjsClient first
                if (yjsStore.yjsClient) {
                    await yjsService.renameProject(newProjectName);
                    // Update the reactive title variable
                    projectTitle = newProjectName;
                } else if (store.project) {
                    // Fallback: update project directly without YjsClient
                    // This is used when navigating to /settings from a project page
                    try {
                        // Update the project title directly
                        const proj = store.project;
                        if (typeof proj?.setTitle === "function") {
                            proj.setTitle(newProjectName);
                            // Update the reactive title variable to trigger UI update
                            projectTitle = proj.title || "";
                            // Trigger reactivity by reassigning the same project reference
                            store.project = proj;
                        }
                        // Update sessionStorage for test compatibility
                        if (browser && storedProjectName) {
                            window.sessionStorage?.setItem("TEST_CURRENT_PROJECT_NAME", newProjectName);
                        }
                        // Update the window variables for test compatibility
                        if (browser) {
                            (window as any).__CURRENT_PROJECT__ = proj;
                            (window as any).__CURRENT_PROJECT_TITLE__ = newProjectName;
                        }
                        // Ensure reactivity propagation by triggering a small update
                        await new Promise((resolve) => setTimeout(resolve, 50));
                    } catch (error) {
                        console.error("Settings: Failed to rename project (fallback)", error);
                    }
                }
            } catch (error) {
                console.error("Settings: renameProject failed", error);
            }
        }
    }
</script>

<div class="settings-container">
    <h1>Settings</h1>

    <section class="rename-section">
        <h2>Rename Project</h2>
        {#if hasActiveProject}
            <p>Current project name: <strong>{currentProjectName}</strong></p>
            <div class="rename-form">
                <input
                    type="text"
                    bind:value={newProjectName}
                    placeholder="Enter new project name"
                    aria-label="New project name"
                />
                <button onclick={handleRename} disabled={!newProjectName || newProjectName === currentProjectName}>
                    Rename
                </button>
            </div>
        {:else}
            <p>No active project selected. Navigate to a project page to rename it.</p>
        {/if}
    </section>
</div>

<style>
    .settings-container {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
    }

    h1 {
        font-size: 2rem;
        margin-bottom: 2rem;
    }

    .rename-section {
        margin-top: 2rem;
    }

    .rename-form {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
    }

    input {
        flex-grow: 1;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    button {
        padding: 0.5rem 1rem;
        border: none;
        background-color: #007bff;
        color: white;
        border-radius: 4px;
        cursor: pointer;
    }

    button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
</style>
