<script lang="ts">
    import { goto } from "$app/navigation";
    import ProjectSelector from "../components/ProjectSelector.svelte";
    import { getLogger } from "../lib/logger";
    import { yjsStore } from "../stores/yjsStore.svelte";

    const logger = getLogger("HomePage");

    async function handleProjectSelected(
        selectedProjectId: string,
        projectName: string,
    ) {
        try {
            const { createYjsClient } = await import("../services");
            const client = await createYjsClient(selectedProjectId);
            yjsStore.yjsClient = client as any;

            logger.info(`Navigating to project page: /${projectName}`);
            goto(`/${projectName}`);
        } catch (error) {
            logger.error("Failed to switch project:", error);
        }
    }
</script>

<svelte:head>
    <title>Outliner</title>
</svelte:head>

<main class="main-content" data-testid="home-page">
    <h1>Outliner</h1>

    <div class="welcome-message">
        <p>Welcome to Outliner!</p>
        <p>Please select from the following options:</p>
    </div>

    <!-- Project Selector -->
    <div class="project-selector-wrapper">
        <h2>Open existing Outliner</h2>
        <ProjectSelector onProjectSelected={handleProjectSelected} />
    </div>

    <!-- Create New Project Link -->
    <div class="action-buttons">
        <a href="/projects/new" class="new-project-button">
            <span class="icon">+</span> Create New Outliner
        </a>
    </div>
</main>

<style>
    main {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
    }

    .main-content {
        padding-top: 5rem;
    }

    h1 {
        color: #333;
        text-align: center;
        margin-bottom: 2rem;
    }

    h2 {
        color: #444;
        margin-bottom: 1rem;
    }

    .welcome-message {
        text-align: center;
        padding: 1.5rem;
        background: #f5f5f5;
        border-radius: 8px;
        margin: 2rem 0;
        color: #555;
    }

    .project-selector-wrapper {
        margin: 2rem 0;
        padding: 1.5rem;
        background: #f9f9f9;
        border-radius: 8px;
        border: 1px solid #eee;
    }

    .action-buttons {
        margin: 2rem 0;
        display: flex;
        justify-content: center;
    }

    .new-project-button {
        display: inline-flex;
        align-items: center;
        background-color: #4caf50;
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        text-decoration: none;
        font-weight: bold;
        transition: background-color 0.2s;
        font-size: 1.1rem;
    }

    .new-project-button:hover {
        background-color: #45a049;
    }

    .new-project-button .icon {
        font-size: 1.2rem;
        margin-right: 0.5rem;
    }
</style>
