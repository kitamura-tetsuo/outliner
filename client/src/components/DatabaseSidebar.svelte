<script lang="ts">
        import { store } from "../stores/store.svelte";
    import { iterateItems } from "../utils/itemTraversal";
    import type { Item } from "../schema/app-schema";
    import { goto } from "$app/navigation";
    import { resolvePath } from "../utils/pathUtils";
    import { page as pageStore } from "$app/stores";

    let { isOpen = $bindable(false) } = $props();

    // Find all pages that contain tables
    let tables = $derived.by(() => {
        void store.pagesVersion;
        const current = store.pages?.current;
        if (!current) return [];

        const result: { pageName: string; tableName: string; schema: string }[] = [];
        const currentItems = Array.isArray(current) ? current : (() => {
            const arr = [];
            const items = current as unknown as { length: number; at: (idx: number) => Item | undefined };
            const len = items.length ?? 0;
            for (let i = 0; i < len; i++) {
                const item = items.at?.(i);
                if (item) arr.push(item);
            }
            return arr;
        })();



        const traverse = (item: Item, pageName: string) => {
            if (item.tableSchema) {
               const match = item.tableSchema.match(/CREATE TABLE\s+([a-zA-Z0-9_]+)/i);
               const tableName = match ? match[1] : "Unnamed Table";
               result.push({
                   pageName,
                   tableName,
                   schema: item.tableSchema
               });
            }
            // item.items gives us access to children
            if (item.items) {
                for (const child of iterateItems(item.items)) {
                    traverse(child, pageName);
                }
            }
        };

        for (const page of currentItems) {
            traverse(page, page.text || "Untitled Page");
        }


        return result;
    });

    let currentProjectName = $derived(
        $pageStore.params.project || store.project?.title || "Untitled Project",
    );

    function navigateToTable(pageName: string) {
        if (store.project) {
            const pageHref = resolvePath(
                `/${encodeURIComponent(currentProjectName)}/${encodeURIComponent(pageName)}`
            );
            goto(pageHref);
            isOpen = false;
        }
    }
</script>

<aside class="sidebar" class:open={isOpen} aria-label="Database Sidebar">
    <div class="sidebar-content">
        <div class="header">
            <h2 class="sidebar-title">Databases</h2>
            <button type="button" class="close-btn" onclick={() => (isOpen = false)} aria-label="Close Database Sidebar">×</button>
        </div>

        <div class="sidebar-section">
            <h3 class="sidebar-section-title">Tables</h3>
            <ul class="table-list">
                {#if tables.length === 0}
                    <li class="sidebar-placeholder">No tables found</li>
                {:else}
                    {#each tables as table (table.tableName + table.pageName)}
                        <li>
                            <button type="button" class="table-item" onclick={() => navigateToTable(table.pageName)}>
                                <span class="table-name">{table.tableName}</span>
                                <span class="page-ref">in {table.pageName}</span>
                            </button>
                        </li>
                    {/each}
                {/if}
            </ul>
        </div>
    </div>
</aside>

<style>
    .sidebar {
        width: 250px;
        height: calc(100vh - 4rem); /* Adjust based on toolbar height */
        position: fixed;
        right: 0; /* Place on the right */
        top: 4rem; /* Below the toolbar */
        background-color: white;
        border-left: 1px solid #e5e7eb;
        transition: transform 0.3s ease;
        overflow-y: auto;
        z-index: 9;
        transform: translateX(100%);
        box-shadow: -2px 0 5px rgba(0,0,0,0.05);
    }

    .sidebar.open {
        transform: translateX(0);
    }

    .sidebar-content {
        padding: 1rem;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .sidebar-title {
        font-size: 1.25rem;
        font-weight: bold;
        color: #1f2937;
        margin: 0;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #6b7280;
    }
    .close-btn:hover {
        color: #1f2937;
    }

    .sidebar-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #4b5563;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .table-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .table-item {
        padding: 0.5rem;
        border-radius: 4px;
        background-color: #f9fafb;
        margin-bottom: 0.25rem;
        border: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        width: 100%;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .table-item:hover {
        background-color: #f3f4f6;
    }

    .table-name {
        font-weight: 500;
        color: #111827;
        font-size: 0.875rem;
    }

    .page-ref {
        font-size: 0.75rem;
        color: #6b7280;
        margin-top: 0.25rem;
    }

    .sidebar-placeholder {
        color: #9ca3af;
        font-size: 0.875rem;
        font-style: italic;
    }
</style>
