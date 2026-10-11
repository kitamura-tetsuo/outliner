<script lang="ts">
import { onMount } from "svelte";
import { goto } from "$app/navigation";
import { userManager } from "../../auth/UserManager";
import AuthComponent from "../AuthComponent.svelte";
import Breadcrumb from "../Breadcrumb.svelte";
import Loader from "../Loader.svelte";
import { store } from "../../stores/store.svelte";
import { createKanban, getKanbanRegistry, listKanbans, type KanbanRegistryEntry } from "../../services/yjstable/kanbanDocs";
import { listTables, type TableRegistryEntry } from "../../services/yjstable/tableDocs";
import { isPublicProject, projectBasePath } from "../../lib/publicProject";
import { projectKanbanPath } from "../../lib/managementPaths";
import { resolvePath } from "../../utils/pathUtils";
import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";

interface Props { projectName: string; }
let { projectName }: Props = $props();
let isAuthenticated = $state(false), isLoading = $state(true), notFound = $state(false);
let error = $state<string | undefined>();
let boards = $state<KanbanRegistryEntry[]>([]), tables = $state<TableRegistryEntry[]>([]);
let name = $state("Kanban"), sourceTableId = $state("");
let handle: RouteProjectHandle | undefined, registry: ReturnType<typeof getKanbanRegistry> | undefined;
let destroyed = false, loadGeneration = 0;
let isDemo = $derived(isPublicProject(projectName));
let canAccess = $derived(isAuthenticated || isDemo);
function refresh() { if (store.project?.ydoc) { boards = listKanbans(store.project.ydoc); tables = listTables(store.project.ydoc); if (!sourceTableId) sourceTableId = tables[0]?.tableId ?? ""; } }
const observer = () => refresh();
function unload() {
    loadGeneration++;
    registry?.unobserveDeep(observer);
    registry = undefined;
    handle?.release();
    handle = undefined;
    boards = [];
    tables = [];
    sourceTableId = "";
    notFound = false;
    error = undefined;
}
function handleLogout() { unload(); isAuthenticated = false; isLoading = false; }
async function load() {
    if (!canAccess) { isLoading = false; return; }
    const generation = ++loadGeneration;
    isLoading = true; error = undefined;
    try { handle?.release(); const nextHandle = await openRouteProject(projectName, () => destroyed || generation !== loadGeneration || !canAccess); if (generation !== loadGeneration || !canAccess) { nextHandle?.release(); return; } handle = nextHandle; if (!handle) { notFound = true; return; } const doc = store.project?.ydoc; if (!doc) throw new Error("Failed to load project document."); registry?.unobserveDeep(observer); registry = getKanbanRegistry(doc); registry.observeDeep(observer); refresh(); }
    catch (e) { if (generation === loadGeneration) error = e instanceof Error ? e.message : "Unable to load Kanbans."; }
    finally { if (generation === loadGeneration) isLoading = false; }
}
function create() {
    if (!store.project?.ydoc || !sourceTableId || !isAuthenticated) return;
    const id = createKanban(store.project.ydoc, sourceTableId, { name: name.trim() || "Kanban" });
    goto(resolvePath(projectKanbanPath(projectName, id)));
}
$effect(() => { if (projectName && canAccess) void load(); else { unload(); isLoading = false; } });
onMount(() => { isAuthenticated = userManager.getCurrentUser() !== null; return () => { destroyed = true; unload(); }; });
</script>
<svelte:head><title>Kanbans | Outliner</title></svelte:head>
<main class="w-full max-w-5xl mx-auto px-4 py-8">
<Breadcrumb items={[{label:"Home",href:"/"},{label:projectName,href:resolvePath(projectBasePath(projectName))},{label:"Kanbans"}]} />
<h1 class="text-2xl font-bold my-4">Kanbans</h1>
{#if isDemo}<p class="mb-4">Public demo / Guest access</p>{:else}<AuthComponent onAuthSuccess={() => isAuthenticated = true} onAuthLogout={handleLogout} />{/if}
{#if isLoading}<Loader />{:else if error}<p role="alert">{error}</p>{:else if notFound}<p>Project not found.</p>{:else if !canAccess}<p>Please log in.</p>{:else}
{#if isAuthenticated}
<form class="create" onsubmit={e => { e.preventDefault(); create(); }} data-testid="kanban-create-form">
    <label>Name <input bind:value={name} /></label><label>Source table <select bind:value={sourceTableId}>{#each tables as table (table.tableId)}<option value={table.tableId}>{table.name} ({table.tableId})</option>{/each}</select></label><button disabled={!sourceTableId}>Create Kanban</button>
</form>
{/if}
{#if boards.length === 0}<p data-testid="project-kanban-list-empty">No Kanbans in this project yet.</p>{:else}<ul data-testid="project-kanban-list">{#each boards as board (board.kanbanId)}<li><a href={resolvePath(projectKanbanPath(projectName,board.kanbanId))}>{board.name || "Untitled Kanban"} <code>{board.kanbanId}</code></a></li>{/each}</ul>{/if}
{/if}
</main>
<style>.create{display:flex;gap:1rem;align-items:end;padding:1rem;background:#f3f4f6;margin:1rem 0}.create label{display:grid}.create input,.create select{border:1px solid #9ca3af;padding:.4rem}button{background:#2563eb;color:white;padding:.45rem .8rem;border-radius:.25rem}li{margin:.5rem 0}a{color:#2563eb}code{font-size:.75rem;color:#6b7280}</style>
