<script lang="ts">
    import { store } from '../../stores/store.svelte';
    import * as yjsService from '../../lib/yjsService.svelte';

    let newProjectName = $state('');
    const currentProjectName = $derived(store.project?.title ?? '');

    // Initialize newProjectName when the component mounts or the project changes.
    $effect(() => {
        newProjectName = currentProjectName;
    });

    async function handleRename() {
        if (newProjectName && newProjectName !== currentProjectName) {
            await yjsService.renameProject(newProjectName);
        }
    }
</script>

<div class="settings-container">
    <h1>Settings</h1>

    <section class="rename-section">
        <h2>Rename Project</h2>
        {#if currentProjectName}
            <p>Current project name: <strong>{currentProjectName}</strong></p>
            <div class="rename-form">
                <input
                    type="text"
                    bind:value={newProjectName}
                    placeholder="Enter new project name"
                    aria-label="New project name"
                />
                <button on:click={handleRename} disabled={!newProjectName || newProjectName === currentProjectName}>
                    Rename
                </button>
            </div>
        {:else}
            <p>No active project selected.</p>
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
