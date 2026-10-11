<script lang="ts">
import { onMount } from "svelte";
import { userManager } from "../../auth/UserManager";
import AuthComponent from "../AuthComponent.svelte";
import Breadcrumb from "../Breadcrumb.svelte";
import Loader from "../Loader.svelte";
import KanbanBoard from "../kanban/KanbanBoard.svelte";
import { store } from "../../stores/store.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { getKanban, getKanbanHandles, getKanbanRegistry, type KanbanHandles } from "../../services/yjstable/kanbanDocs";
import { getTableRegistry, listTables } from "../../services/yjstable/tableDocs";
import { isPublicProject, projectBasePath } from "../../lib/publicProject";
import { projectKanbansPath, projectTablePath } from "../../lib/managementPaths";
import { resolvePath } from "../../utils/pathUtils";
import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";
interface Props { projectName:string; kanbanId:string; }
let { projectName, kanbanId }: Props = $props();
let authenticated=$state(false), loading=$state(true), notFound=$state(false), missingSource=$state(false);
let error=$state<string|undefined>(), handles=$state<KanbanHandles|undefined>(), name=$state("Kanban"), sourceName=$state(""), sourceId=$state("");
let projectDoc=$state<NonNullable<typeof store.project>["ydoc"]|undefined>();
let routeHandle:RouteProjectHandle|undefined, destroyed=false, loadGeneration=0;
let registry:ReturnType<typeof getKanbanRegistry>|undefined, tableRegistry:ReturnType<typeof getTableRegistry>|undefined;
let demo=$derived(isPublicProject(projectName)), canAccess=$derived(authenticated||demo);
function refresh(){ if(!projectDoc)return; const definition=getKanban(projectDoc,kanbanId); if(!definition){notFound=true;handles=undefined;return;} name=definition.name; sourceId=definition.sourceTableId; const source=listTables(projectDoc).find(t=>t.tableId===sourceId); missingSource=!source; sourceName=source?.name??""; }
const observer=()=>refresh();
function unload(){loadGeneration++;registry?.unobserveDeep(observer);tableRegistry?.unobserveDeep(observer);registry=undefined;tableRegistry=undefined;routeHandle?.release();routeHandle=undefined;projectDoc=undefined;handles=undefined;sourceName="";sourceId="";missingSource=false;notFound=false;error=undefined;}
function handleLogout(){unload();authenticated=false;loading=false;}
async function load(){if(!canAccess){loading=false;return;} const generation=++loadGeneration;loading=true;try{routeHandle?.release();const nextHandle=await openRouteProject(projectName,()=>destroyed||generation!==loadGeneration||!canAccess);if(generation!==loadGeneration||!canAccess){nextHandle?.release();return;}routeHandle=nextHandle;if(!routeHandle){notFound=true;return;}projectDoc=store.project?.ydoc;if(!projectDoc)throw new Error("Failed to load project document.");handles=getKanbanHandles(projectDoc,kanbanId);if(!handles){notFound=true;return;}registry=getKanbanRegistry(projectDoc);tableRegistry=getTableRegistry(projectDoc);registry.observeDeep(observer);tableRegistry.observeDeep(observer);refresh();}catch(e){if(generation===loadGeneration)error=e instanceof Error?e.message:"Unable to load Kanban.";}finally{if(generation===loadGeneration)loading=false;}}
$effect(()=>{if(projectName&&kanbanId&&canAccess)void load();else{unload();loading=false;}});
onMount(()=>{authenticated=userManager.getCurrentUser()!==null;return()=>{destroyed=true;unload();};});
</script>
<svelte:head><title>{name} | Outliner</title></svelte:head>
<main class="w-full max-w-7xl mx-auto px-4 py-8"><Breadcrumb items={[{label:"Home",href:"/"},{label:projectName,href:resolvePath(projectBasePath(projectName))},{label:"Kanbans",href:resolvePath(projectKanbansPath(projectName))},{label:name}]} /><div class="heading"><h1>{name}</h1>{#if sourceName}<a data-testid="kanban-source-table-link" href={resolvePath(projectTablePath(projectName,sourceId))}>Source table: {sourceName}</a>{/if}</div>
{#if demo}<p>Public demo / Guest access</p>{:else}<AuthComponent onAuthSuccess={()=>authenticated=true} onAuthLogout={handleLogout}/>{/if}
{#if loading}<Loader/>{:else if error}<p role="alert">{error}</p>{:else if notFound}<p data-testid="kanban-not-found">Kanban not found.</p>{:else if missingSource}<p data-testid="kanban-missing-source" role="alert">Kanban source Table is missing.</p>{:else if canAccess&&handles&&projectDoc}{#key `${handles.kanbanId}:${handles.entry.doc?.guid ?? "detached"}`}<KanbanBoard kanban={handles} {projectDoc} projectId={yjsStore.currentProjectId??undefined} isReadOnly={demo}/>{/key}{/if}</main>
<style>.heading{display:flex;gap:1rem;align-items:baseline;margin:1rem 0}.heading h1{font-size:1.5rem;font-weight:700}.heading a{color:#2563eb}</style>
