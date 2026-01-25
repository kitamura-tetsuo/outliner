"main-content" class:with-sidebar={isSidebarOpen} tabindex="-1" style="outline: none;">
        {@render children()}
    </div>

    <button
        class="theme-toggle fixed bottom-4 right-4 p-2 rounded bg-gray-200 dark:bg-gray-700"
        onclick={() => userPreferencesStore.toggleTheme()}
    >
        {currentTheme === "light" ? "Dark Mode" : "Light Mode"}
    </button>
</div>

<style>
/* Keep content clear of the fixed Toolbar (height ~4rem) */
.main-content {
    padding-top: 5rem;
    transition: margin-left 0.3s ease;
}

/* Add left margin when sidebar is open */
.main-content.with-sidebar {
    margin-left: 250px;
}

/* Sidebar toggle button */
.sidebar-toggle {
    position: fixed;
    top: 6rem;
    left: 1rem;
    z-index: 100;
    width: 40px;
    height: 40px;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease, left 0.3s ease;
}

.sidebar-toggle:hover {
    background-color: #2563eb;
}

/* Dark mode for sidebar toggle */
:global(html.dark) .sidebar-toggle {
    background-color: #1d4ed8;
}

:global(html.dark) .sidebar-toggle:hover {
    background-color: #1e40af;
}

/* Theme toggle button - ensure it's above the sidebar */
.theme-toggle {
    z-index: 50;
}

/* Skip link for accessibility */
.skip-link {
    position: fixed;
    top: -9999px;
    left: 0.5rem;
    z-index: 20000; /* Above toolbar */
    background: #3b82f6; /* Blue 500 */
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    text-decoration: none;
    font-weight: 500;
    transition: top 0.2s ease;
}

.skip-link:focus {
    top: 0.5rem;
    outline: 2px solid white;
    box-shadow: 0 0 0 4px #3b82f6;
}
</style>
