<script lang="ts">
    let { isOpen = $bindable(true) } = $props();
</script>

<aside class="sidebar" class:open={isOpen}>
    <div class="sidebar-content">
        <h2 class="sidebar-title">Sidebar</h2>
        <p class="sidebar-description">This is a placeholder sidebar component.</p>

        <!-- Placeholder sections -->
        <div class="sidebar-section">
            <h3 class="sidebar-section-title">Projects</h3>
            <p class="sidebar-placeholder">Project list will be implemented here</p>
        </div>

        <div class="sidebar-section">
            <h3 class="sidebar-section-title">Pages</h3>
            <p class="sidebar-placeholder">Page list will be implemented here</p>
        </div>

        <div class="sidebar-section">
            <h3 class="sidebar-section-title">Settings</h3>
            <p class="sidebar-placeholder">Settings link will be implemented here</p>
        </div>
    </div>
</aside>

<style>
    .sidebar {
        width: 0;
        height: 100vh;
        position: fixed;
        left: 0;
        top: 5rem; /* Below the toolbar */
        background-color: white;
        border-right: 1px solid #e5e7eb;
        transition: width 0.3s ease;
        overflow: hidden;
        z-index: 10;
    }

    .sidebar.open {
        width: 250px;
    }

    .sidebar-content {
        padding: 1rem;
        height: 100%;
        overflow-y: auto;
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
</style>
