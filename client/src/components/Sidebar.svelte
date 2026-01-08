<script lang="ts">
    import { projectStore } from "../stores/projectStore.svelte";
    import { store } from "../stores/store.svelte";
    import { resolve } from "$app/paths";

    let { isOpen = $bindable(true) } = $props();

    // Collapsible state for Projects section
    let isProjectsCollapsed = $state(false);
    // Collapsible state for Pages section
    let isPagesCollapsed = $state(false);
    // Use $derived.by to track explicit version signal from store
    // Also triggers when pagesVersion changes OR when pages.current changes directly
    let pages = $derived.by(() => {
        // Subscribe to pagesVersion signal
        void store.pagesVersion;
        // Direct access to pages.current as fallback for when pagesVersion=0
        const current = store.pages?.current;
        // Convert Items to array if it has length property (Y.Array like)
        if (!current) return [];
        if (Array.isArray(current)) return current;
        // For Y.Array/Items, iterate and collect
        const result: any[] = [];
        const len = (current as any).length ?? 0;
        for (let i = 0; i < len; i++) {
            const item = (current as any).at?.(i);
            if (item) result.push(item);
        }
        return result;
    });
</script>

<aside class="sidebar" class:open={isOpen}>
    <div class="sidebar-content">
        <h2 class="sidebar-title">Sidebar</h2>
        <p class="sidebar-description">
            This is a placeholder sidebar component.
        </p>

        <!-- Projects section -->
        <div class="sidebar-section">
            <button
                class="section-header"
                onclick={() => (isProjectsCollapsed = !isProjectsCollapsed)}
                aria-expanded={!isProjectsCollapsed}
                aria-label="Toggle projects section"
            >
                <h3 class="sidebar-section-title">Projects</h3>
                <svg
                    class="chevron-icon"
                    class:rotated={isProjectsCollapsed}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M4 6L8 10L12 6"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>

            {#if !isProjectsCollapsed}
                <div class="project-list">
                    {#if projectStore.projects.length === 0}
                        <p class="sidebar-placeholder">No projects available</p>
                    {:else}
                        {#each projectStore.projects as project (project.id)}
                            <a href={`/${project.id}`} class="project-item">
                                <span class="project-name">{project.name}</span>
                                {#if project.isDefault}
                                    <span class="default-badge">Default</span>
                                {/if}
                            </a>
                        {/each}
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Pages section -->
        <div class="sidebar-section">
            <button
                class="section-header"
                onclick={() => (isPagesCollapsed = !isPagesCollapsed)}
                aria-expanded={!isPagesCollapsed}
                aria-label="Toggle pages section"
            >
                <h3 class="sidebar-section-title">Pages</h3>
                <svg
                    class="chevron-icon"
                    class:rotated={isPagesCollapsed}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M4 6L8 10L12 6"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>

            {#if !isPagesCollapsed}
                <div class="page-list">
                    {#if !pages || pages.length === 0}
                        <p class="sidebar-placeholder">No pages available</p>
                    {:else}
                        {#each pages as page (page.id)}
                            <a
                                class="page-item"
                                href={resolve(
                                    `/${encodeURIComponent(store.project?.title || "Untitled Project")}/${encodeURIComponent(page.text)}`,
                                )}
                            >
                                <span class="page-title"
                                    >{page.text || "Untitled page"}</span
                                >
                                <span class="page-date"
                                    >{new Date(
                                        page.lastChanged,
                                    ).toLocaleDateString()}</span
                                >
                            </a>
                        {/each}
                    {/if}
                </div>
            {/if}
        </div>

        <div class="sidebar-section">
            <h3 class="sidebar-section-title">Settings</h3>
            <a class="settings-link" href={resolve("/settings")}>
                <span class="settings-text">Settings</span>
            </a>
        </div>
    </div>
</aside>

<style>
    .sidebar {
        width: 250px;
        max-width: 250px;
        height: calc(100vh - 5rem);
        position: fixed;
        left: 0;
        top: 5rem; /* Below the toolbar */
        background-color: white;
        border-right: 1px solid #e5e7eb;
        transition: transform 0.3s ease, visibility 0s linear 0.3s;
        overflow: hidden;
        z-index: 10;
        transform: translateX(-100%);
        visibility: hidden;
    }

    .sidebar.open {
        transform: translateX(0);
        visibility: visible;
        transition: transform 0.3s ease, visibility 0s linear 0s;
    }

    .sidebar-content {
        padding: 1rem;
        height: 100%;
        width: 100%;
        overflow-y: auto;
        box-sizing: border-box;
    }

    .sidebar-title {
        font-size: 1.5rem;
        font-weight: bold;
        margin-bottom: 1rem;
        color: #1f2937;
    }

    .sidebar-description {
        color: #6b7280;
        margin-bottom: 2rem;
        font-size: 0.875rem;
    }

    .sidebar-section {
        margin-bottom: 2rem;
    }

    .sidebar-section-title {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #374151;
    }

    .sidebar-placeholder {
        color: #9ca3af;
        font-size: 0.875rem;
        font-style: italic;
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        cursor: pointer;
        user-select: none;
        padding: 0.25rem 0;
        background: none;
        border: none;
        text-align: left;
        color: inherit;
        font: inherit;
    }

    .section-header:hover .sidebar-section-title {
        color: #2563eb;
    }

    .section-header:hover .chevron-icon {
        color: #374151;
    }

    :global(html.dark) .section-header:hover .sidebar-section-title {
        color: #60a5fa;
    }

    :global(html.dark) .section-header:hover .chevron-icon {
        color: #e5e7eb;
    }

    .chevron-icon {
        transition: transform 0.2s ease;
    }

    .chevron-icon.rotated {
        transform: rotate(-90deg);
    }

    .project-list {
        margin-top: 0.5rem;
    }

    .project-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem;
        border-radius: 4px;
        background-color: rgba(0, 0, 0, 0.02);
        margin-bottom: 0.25rem;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }

    .project-item:hover {
        background-color: rgba(0, 0, 0, 0.05);
    }

    .project-item:last-child {
        margin-bottom: 0;
    }

    .project-name {
        font-size: 0.875rem;
        color: #374151;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .page-list {
        margin-top: 0.5rem;
    }

    .page-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem;
        border-radius: 4px;
        background-color: rgba(0, 0, 0, 0.02);
        margin-bottom: 0.25rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
        text-decoration: none; /* Added */
        color: inherit; /* Added */
    }

    .page-item:hover {
        background-color: rgba(0, 0, 0, 0.05);
    }

    .page-item:last-child {
        margin-bottom: 0;
    }

    .page-title {
        font-size: 0.875rem;
        color: #374151;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        margin-right: 0.5rem;
    }

    .page-date {
        font-size: 0.75rem;
        color: #9ca3af;
        flex-shrink: 0;
    }

    .default-badge {
        font-size: 0.75rem;
        padding: 0.125rem 0.375rem;
        background-color: #10b981;
        color: white;
        border-radius: 3px;
        font-weight: 500;
        margin-left: 0.5rem;
        flex-shrink: 0;
    }

    .settings-link {
        display: flex;
        align-items: center;
        padding: 0.5rem;
        border-radius: 4px;
        background-color: rgba(0, 0, 0, 0.02);
        margin-top: 0.5rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
        text-decoration: none; /* Added */
        color: inherit; /* Added */
    }

    .settings-link:hover {
        background-color: rgba(0, 0, 0, 0.05);
    }

    .settings-text {
        font-size: 0.875rem;
        color: #374151;
    }

    :global(html.dark) .project-item {
        background-color: rgba(255, 255, 255, 0.05);
    }

    :global(html.dark) .project-name {
        color: #e5e7eb;
    }

    :global(html.dark) .page-item {
        background-color: rgba(255, 255, 255, 0.05);
    }

    :global(html.dark) .page-item:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }

    :global(html.dark) .page-title {
        color: #e5e7eb;
    }

    :global(html.dark) .page-date {
        color: #9ca3af;
    }

    :global(html.dark) .section-header:hover .sidebar-section-title {
        color: #60a5fa;
    }

    /* Dark mode styles */
    :global(html.dark) .sidebar {
        background-color: #111827;
        border-right-color: #374151;
    }

    :global(html.dark) .sidebar-title {
        color: #f9fafb;
    }

    :global(html.dark) .sidebar-description {
        color: #9ca3af;
    }

    :global(html.dark) .sidebar-section-title {
        color: #e5e7eb;
    }

    :global(html.dark) .sidebar-placeholder {
        color: #6b7280;
    }

    :global(html.dark) .settings-link {
        background-color: rgba(255, 255, 255, 0.05);
    }

    :global(html.dark) .settings-link:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }

    :global(html.dark) .settings-text {
        color: #e5e7eb;
    }
</style>
