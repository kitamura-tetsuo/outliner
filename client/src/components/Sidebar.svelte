<script lang="ts">
    import { projectStore } from "../stores/projectStore.svelte";
    import { store } from "../stores/store.svelte";
    import { resolve } from "$app/paths";
    import { page as pageStore } from "$app/stores";

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
                    aria-hidden="true"
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
                <ul class="project-list">
                    {#if projectStore.projects.length === 0}
                        <li class="sidebar-placeholder">No projects available</li>
                    {:else}
                        {#each projectStore.projects as project (project.id)}
                            <li>
                                <a
                                    href={`/${encodeURIComponent(project.name)}`}
                                    class="project-item"
                                    aria-current={$pageStore.url.pathname === `/${encodeURIComponent(project.name)}` ? "page" : undefined}
                                    class:active={$pageStore.url.pathname === `/${encodeURIComponent(project.name)}`}
                                >
                                    <span class="item-content-wrapper">
                                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon">
                                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                                        </svg>
                                        <span class="project-name">{project.name}</span>
                                    </span>
                                    {#if project.isDefault}
                                        <span class="default-badge">Default</span>
                                    {/if}
                                </a>
                            </li>
                        {/each}
                    {/if}
                </ul>
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
                    aria-hidden="true"
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
                <ul class="page-list">
                    {#if !pages || pages.length === 0}
                        <li class="sidebar-placeholder">No pages available</li>
                    {:else}
                        {#each pages as page (page.id)}
                            {@const pageHref = resolve(
                                `/${encodeURIComponent(store.project?.title || "Untitled Project")}/${encodeURIComponent(page.text)}`,
                            )}
                            <li>
                                <a
                                    class="page-item"
                                    href={pageHref}
                                    aria-current={$pageStore.url.pathname === pageHref ? "page" : undefined}
                                    class:active={$pageStore.url.pathname === pageHref}
                                >
                                    <span class="item-content-wrapper">
                                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon">
                                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                            <line x1="16" y1="13" x2="8" y2="13"/>
                                            <line x1="16" y1="17" x2="8" y2="17"/>
                                            <line x1="10" y1="9" x2="8" y2="9"/>
                                        </svg>
                                        <span class="page-title"
                                            >{page.text || "Untitled page"}</span
                                        >
                                    </span>
                                    <span class="page-date"
                                        >{new Date(
                                            page.lastChanged,
                                        ).toLocaleDateString()}</span
                                    >
                                </a>
                            </li>
                        {/each}
                    {/if}
                </ul>
            {/if}
        </div>

        <div class="sidebar-section">
            <h3 class="sidebar-section-title">Settings</h3>
            <a
                class="settings-link"
                href={resolve("/settings")}
                aria-current={$pageStore.url.pathname === resolve("/settings") ? "page" : undefined}
                class:active={$pageStore.url.pathname === resolve("/settings")}
            >
                <span class="item-content-wrapper">
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.72l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span class="settings-text">Settings</span>
                </span>
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
        transition: transform 0.3s ease;
        overflow: hidden;
        z-index: 10;
        transform: translateX(-100%);
    }

    .sidebar.open {
        transform: translateX(0);
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
        list-style: none; /* Ensure no bullet for placeholder li */
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
        list-style: none; /* Remove bullets */
        padding: 0;
        margin: 0.5rem 0 0 0;
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

    .project-item.active {
        background-color: rgba(37, 99, 235, 0.1);
        color: #2563eb;
        font-weight: 500;
    }

    .project-list li:last-child .project-item {
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
        list-style: none; /* Remove bullets */
        padding: 0;
        margin: 0.5rem 0 0 0;
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

    .page-item.active {
        background-color: rgba(37, 99, 235, 0.1);
        color: #2563eb;
        font-weight: 500;
    }

    .page-list li:last-child .page-item {
        margin-bottom: 0;
    }

    .page-title {
        font-size: 0.875rem;
        color: #374151;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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

    .settings-link.active {
        background-color: rgba(37, 99, 235, 0.1);
        color: #2563eb;
        font-weight: 500;
    }

    .settings-text {
        font-size: 0.875rem;
        color: #374151;
    }

    .item-content-wrapper {
        display: flex;
        align-items: center;
        min-width: 0;
        flex: 1;
        overflow: hidden;
    }

    .item-icon {
        flex-shrink: 0;
        margin-right: 0.5rem;
        color: #6b7280;
    }

    /* Hover effect for icon */
    .project-item:hover .item-icon,
    .page-item:hover .item-icon,
    .settings-link:hover .item-icon {
        color: #374151;
    }

    :global(html.dark) .project-item {
        background-color: rgba(255, 255, 255, 0.05);
    }

    :global(html.dark) .project-item.active {
        background-color: rgba(96, 165, 250, 0.2);
        color: #60a5fa;
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

    :global(html.dark) .page-item.active {
        background-color: rgba(96, 165, 250, 0.2);
        color: #60a5fa;
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

    :global(html.dark) .settings-link.active {
        background-color: rgba(96, 165, 250, 0.2);
        color: #60a5fa;
    }

    :global(html.dark) .settings-text {
        color: #e5e7eb;
    }

    :global(html.dark) .item-icon {
        color: #9ca3af;
    }

    :global(html.dark) .project-item:hover .item-icon,
    :global(html.dark) .page-item:hover .item-icon,
    :global(html.dark) .settings-link:hover .item-icon {
        color: #e5e7eb;
    }
</style>
