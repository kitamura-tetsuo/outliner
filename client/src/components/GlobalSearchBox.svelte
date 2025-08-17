<script lang="ts">
import { goto } from '$app/navigation';
import type { Item, Project } from '@common/schema/app-schema';
import { userManager } from '../auth/UserManager';
import { getUserContainers, getFluidClient } from '../lib/fluidService.svelte';

let query = $state('');
let selected = $state(-1);
let isFocused = $state(false);
let results = $state([]);

async function search() {
    if (!query) {
        results = [];
        return;
    }

    // Try server search first (if available), then gracefully fall back to client-side search.
    try {
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (idToken) {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ idToken, query }),
            });

            if (response.ok) {
                const data = await response.json();
                results = data.results || [];
                if (results.length) return; // Found results via server
            }
        }
    } catch {
        // ignore and fall back to client-side search
    }

    // Fallback: client-side global search across accessible containers (used in tests)
    try {
        const { containers } = await getUserContainers();
        const aggregated: any[] = [];
        for (const containerId of containers) {
            try {
                const [, , , , project] = await getFluidClient(containerId);
                if (!project?.items) continue;
                // Linear scan of pages; items never contain newlines per project policy
                const pages = project.items as any[];
                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    if (page?.text && page.text.toLowerCase().includes(query.toLowerCase())) {
                        aggregated.push({ project: { title: project.title }, page: { text: page.text } });
                    }
                }
            } catch {
                // skip container on error
            }
        }
        results = aggregated;
    } catch {
        results = [];
    }
}

function handleKeydown(e: KeyboardEvent) {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (results.length) selected = (selected + 1) % results.length;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (results.length) selected = (selected - 1 + results.length) % results.length;
    } else if (e.key === 'Enter') {
        e.preventDefault();
        navigateToPage();
    }
}

function navigateToPage(page?: any) {
    const targetPage = page || (selected >= 0 && results[selected] ? results[selected] : null);
    if (targetPage) {
        goto(`/${targetPage.project.title}/${targetPage.page.text}`);
    } else if (query) {
        goto(`/search?query=${encodeURIComponent(query)}`);
    }
}

function handlePageClick(page: any) {
    navigateToPage(page);
}
</script>

<div class="page-search-box">
    <input
        type="text"
        placeholder="Global Search"
        bind:value={query}
        oninput={search}
        onkeydown={handleKeydown}
        onfocus={() => (isFocused = true)}
        onblur={() => (isFocused = false)}
    />
    {#if results.length && isFocused}
        <ul>
            {#each results as page, i}
                <li class:selected={i === selected}>
                    <button type="button" onclick={() => handlePageClick(page)}>
                        {page.project.title} / {page.page.text}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
.page-search-box {
    position: relative;
    width: 100%;
    max-width: 400px;
}

.page-search-box input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
}

.page-search-box input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.page-search-box ul {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1100;
    background: white;
    border: 1px solid #d1d5db;
    border-top: none;
    border-radius: 0 0 0.375rem 0.375rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0;
    margin: 0;
    list-style: none;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.page-search-box li {
    padding: 0;
}

.page-search-box li.selected {
    background: #eff6ff;
}

.page-search-box li button {
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: #374151;
}

.page-search-box li button:hover {
    background: #f3f4f6;
}

.page-search-box li.selected button {
    background: #eff6ff;
    color: #1d4ed8;
}
</style>
