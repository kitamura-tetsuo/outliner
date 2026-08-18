<script lang="ts">
import { safeDecodeURIComponent } from "../utils/urlUtils";
import { getLogger } from "../lib/logger";
const logger = getLogger("Toolbar");
import type { Project } from "../schema/app-schema";
import SearchBox from "./SearchBox.svelte";
import { isProvisionalProject, store } from "../stores/store.svelte";
import { page as pageStore } from "$app/stores";
import { onMount, onDestroy } from "svelte";
import LoginStatusIndicator from "./LoginStatusIndicator.svelte";
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";
import { globalUndoRouter } from "../services/undo/undoRouter.svelte";
import { preventEditorBlur, restoreEditorFocus } from "../lib/editorFocus";
import { projectBasePath } from "../lib/publicProject";
import { resolvePath } from "../utils/pathUtils";

interface Props {
    onToggleDatabaseSidebar?: () => void;
    project?: Project | null;
}

let { project = null, onToggleDatabaseSidebar }: Props = $props();
let toolbarEl: HTMLDivElement | null = null;

// Fallback to global store.project when prop is not provided
let effectiveProject: Project | null = $derived(project ?? store.project ?? null);

// The project segment of the current route, which is how a project without a
// title of its own is addressed. Demo routes carry it under their own param.
// `params` is absent outside a routed context (component tests), hence `?.`.
let routedProjectName: string = $derived(
    ($pageStore.params?.demoProject as string | undefined) ?? $pageStore.params?.project ?? "",
);

// The router's stacks are `$state`, so availability tracks every recorded and
// consumed operation across the outline, the tables and the calendar.
let canUndo = $derived(globalUndoRouter.canUndo());
let canRedo = $derived(globalUndoRouter.canRedo());

// The title a project carries lives in its Yjs metadata map, which has no
// reactivity of its own and is often still empty at the moment the document is
// opened — the server writes it as part of the first sync. So it is mirrored
// into `$state` through an observer rather than read once.
let projectTitle = $state("");

/**
 * Bind the mirror to `target`'s metadata, returning the unbind.
 *
 * The provisional project the store seeds at startup is titled from the URL's
 * first segment, so showing it would put "Untitled Project" in the header on
 * routes that name no project: identity appears only once the real document is
 * open. A loaded project with no title of its own falls back to the route's
 * project segment, which is what such a document is addressed by.
 */
function bindProjectTitle(target: Project | null, routedProject: string): () => void {
    if (!target?.ydoc || isProvisionalProject(target)) {
        projectTitle = "";
        return () => {};
    }
    const meta = target.ydoc.getMap("metadata");
    const syncTitle = () => {
        projectTitle = String(meta.get("title") ?? "").trim() || routedProject;
    };
    syncTitle();
    meta.observe(syncTitle);
    return () => meta.unobserve(syncTitle);
}

// The project a mounted toolbar shows changes at runtime, and so does the
// document its title has to be read from, so the observer has to be rebound
// and released as that happens — the one thing `onMount`/`onDestroy` cannot
// express. This is the Yjs mirror pattern AGENTS.md prescribes.
$effect(() => bindProjectTitle(effectiveProject, routedProjectName));

function handleUndo() {
    globalUndoRouter.undo();
    restoreEditorFocus();
}

function handleRedo() {
    globalUndoRouter.redo();
    restoreEditorFocus();
}






	type FluidClientLike = { getProject: () => Project };
	type FluidServiceLike = {
	    getClientByProjectTitle?: (title: string) => Promise<FluidClientLike | undefined> | FluidClientLike | undefined;
	    getFluidClientByProjectTitle?: (title: string) => Promise<FluidClientLike | undefined> | FluidClientLike | undefined;
	};

	type ClientRegistryLike = {
	    getAllKeys?: () => string[];
	    get?: (key: string) => unknown;
	};

	type ToolbarDebugGlobals = {
	    __CURRENT_PROJECT__?: Project;
	    __FLUID_CLIENT_REGISTRY__?: ClientRegistryLike;
	    __FLUID_SERVICE__?: FluidServiceLike;
	};

	function isProject(value: unknown): value is Project {
	    return !!value
	        && typeof value === "object"
	        && "ydoc" in value
	        && "tree" in value;
	}

	let resizeObserver: ResizeObserver | null = null;

	onDestroy(() => {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
	});

	// As a last resort, resolve from service by URL param to support tests
	onMount(() => {
		if (toolbarEl && typeof window !== 'undefined') {
			// Initialize with current height immediately
			const rect = toolbarEl.getBoundingClientRect();
			if (rect.height > 0) {
				document.documentElement.style.setProperty('--toolbar-height', `${rect.height}px`);
			}

			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					if (entry.target === toolbarEl) {
						// Use borderBoxSize if available for full element height including padding/borders
						const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
						document.documentElement.style.setProperty('--toolbar-height', `${height}px`);
					}
				}
			});
			resizeObserver.observe(toolbarEl);
		}

	    const init = async () => {
	    try {
	        if (!effectiveProject && typeof window !== "undefined") {
	            const globals = window as unknown as ToolbarDebugGlobals;
	            // First, use direct global current project if available
	            const cur = globals.__CURRENT_PROJECT__;
	            if (cur) {
	                project = cur;
	            } else {
	                // Fallback: pick latest project from client registry
	                const reg = globals.__FLUID_CLIENT_REGISTRY__;
	                if (typeof reg?.getAllKeys === "function") {
	                    const keys = reg.getAllKeys();
	                    if (keys.length > 0) {
	                        const last = keys[keys.length - 1];
	                        const inst = last && reg.get ? reg.get(last) : undefined;
	                        const projCandidate = Array.isArray(inst) ? inst[4] : undefined;
	                        if (isProject(projCandidate)) project = projCandidate;
	                    }
	                }
	                if (!project) {
	                    const pathParts = window.location.pathname.split("/").filter(Boolean).map(safeDecodeURIComponent);
	                    // Named apart from the reactive `projectTitle` mirror above:
	                    // this is only the URL guess used to look a client up.
	                    let titleFromPath = "";
	                    if (pathParts[0]) {
	                        titleFromPath = pathParts[0];
	                    }
	                    const service = globals.__FLUID_SERVICE__;
	                    if (service && titleFromPath) {
	                        const getClient = service.getClientByProjectTitle ?? service.getFluidClientByProjectTitle;
	                        const client = getClient ? await Promise.resolve(getClient(titleFromPath)) : undefined;
	                        if (client) project = client.getProject();
	                    }
	                }
	            }
	        }
	    } catch (e) {
	        logger.warn("Toolbar: failed to resolve project by title", e);
    }
    };
    init();
});


</script>

<div class="main-toolbar" data-testid="main-toolbar" bind:this={toolbarEl} >
    <div class="main-toolbar-content" >
        <div class="toolbar-left">
            {#if projectTitle}
                <!-- Project identity for the whole shell: page views no longer
                     repeat it above the editable page title. -->
                <a
                    class="project-name"
                    data-testid="toolbar-project-name"
                    href={resolvePath(projectBasePath(projectTitle))}
                    title={projectTitle}
                    aria-label={`Project: ${projectTitle}`}
                >{projectTitle}</a>
            {/if}
            <button type="button"
                class="add-database-btn"
                aria-label="Add Database"
                title="Add Database"
                onclick={() => commandPaletteStore.insert("yjstable")}
            >
                <span class="btn-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </span>
                <span class="btn-text">Add Database</span>
            </button>
            <!-- Undo/redo always go through the global router, never through a
                 scope's own Y.UndoManager, so the buttons behave exactly like
                 Ctrl+Z / Ctrl+Shift+Z. `data-keep-editor-focus` plus the
                 pointerdown guard keep the caret and the software keyboard. -->
            <button type="button"
                class="history-btn"
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
                data-testid="toolbar-undo"
                data-keep-editor-focus
                disabled={!canUndo}
                onpointerdown={preventEditorBlur}
                onclick={handleUndo}
            >
                <span class="btn-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 14 4 9 9 4"></polyline>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                    </svg>
                </span>
                <span class="btn-text">Undo</span>
            </button>
            <button type="button"
                class="history-btn"
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
                data-testid="toolbar-redo"
                data-keep-editor-focus
                disabled={!canRedo}
                onpointerdown={preventEditorBlur}
                onclick={handleRedo}
            >
                <span class="btn-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 14 20 9 15 4"></polyline>
                        <path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>
                    </svg>
                </span>
                <span class="btn-text">Redo</span>
            </button>
            <div role="search">
                <SearchBox project={effectiveProject ?? undefined} />
            </div>
        </div>
        <div class="toolbar-right">
            {#if onToggleDatabaseSidebar}
                <button type="button" class="databases-btn" onclick={onToggleDatabaseSidebar} aria-label="Toggle Databases Sidebar">
                    Databases
                </button>
            {/if}
            <LoginStatusIndicator />
        </div>
    </div>
</div>

<style>
.main-toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10000; /* ensure above all content */
    background: white;
    border-bottom: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 0.75rem 1rem;
    min-height: 4rem;
    height: auto; /* Replace explicit height for mobile wrap */
    pointer-events: auto;
    /* Ensure pointer events only work within the toolbar bounds */
    overflow: visible;
}

.main-toolbar-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
}

.toolbar-left {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
}

.toolbar-left > div {
    flex: 1 1 auto;
}

.project-name {
    /* Clears the fixed sidebar toggle (left: 1rem, width: 2.5rem). */
    margin-left: 3.5rem;
    margin-right: 1rem;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    text-decoration: none;
    flex: 0 1 auto;
    /* WCAG 2.2 SC 2.5.8: every interactive target stays at least 24x24. */
    display: inline-flex;
    align-items: center;
    min-height: 1.5rem;
    min-width: 1.5rem;
}

.project-name:hover {
    text-decoration: underline;
}

/* The label already cleared the toggle; the button must not clear it twice. */
.project-name + .add-database-btn {
    margin-left: 0;
}

.add-database-btn {
    margin-left: 3.5rem;
    margin-right: 1rem;
    padding: 0.25rem 0.75rem;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
}

.add-database-btn .btn-icon {
    display: inline-flex;
    align-items: center;
}

.add-database-btn:hover {
    background-color: #e5e7eb;
}

.history-btn {
    margin-right: 0.5rem;
    padding: 0.25rem 0.75rem;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    flex: 0 0 auto;
}

.history-btn .btn-icon {
    display: inline-flex;
    align-items: center;
}

.history-btn:hover:not(:disabled) {
    background-color: #e5e7eb;
}

.history-btn:disabled {
    opacity: 0.45;
    cursor: default;
}

.databases-btn {
    margin-right: 1rem;
    padding: 0.25rem 0.75rem;
    background-color: transparent;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: background-color 0.2s;
}

.databases-btn:hover {
    background-color: #f3f4f6;
}

.toolbar-right {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
}

@media (max-width: 640px) {
    .main-toolbar-content {
        flex-direction: column;
        align-items: stretch;
    }

    .toolbar-left {
        flex-wrap: wrap;
        row-gap: 0.5rem;
    }

    .project-name {
        max-width: calc(100% - 3.5rem);
        font-size: 0.9375rem;
    }

    .add-database-btn {
        margin-left: 0;
        margin-right: 0.5rem;
        padding: 0.25rem 0.5rem;
    }

    .add-database-btn .btn-text {
        display: none;
    }

    .history-btn {
        margin-right: 0.5rem;
        padding: 0.25rem 0.5rem;
    }

    .history-btn .btn-text {
        display: none;
    }

    .toolbar-right {
        justify-content: stretch;
    }

    .toolbar-right :global(.login-status-indicator) {
        width: 100%;
        justify-content: flex-start;
    }
}

</style>
