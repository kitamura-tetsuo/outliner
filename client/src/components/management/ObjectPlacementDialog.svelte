<script lang="ts">
import type { Project } from "$shared/app-schema";
import { onMount } from "svelte";
import { userManager } from "../../auth/UserManager";
import { placeObjectOnPage, type PlaceableObjectType } from "../../services/objectManager/objectPlacement";

interface Props {
    project: Project;
    objectType: PlaceableObjectType;
    objectId: string;
    objectName: string;
    onclose: () => void;
}

let { project, objectType, objectId, objectName, onclose }: Props = $props();
let pageId = $state("");
let pages = $state<{ id: string; title: string; }[]>([]);

function syncPages() {
    pages = [...project.items].map(page => ({ id: page.id, title: page.text || "Untitled Page" }));
    if (pageId && !pages.some(page => page.id === pageId)) pageId = pages[0]?.id ?? "";
}

onMount(() => {
    const tree = project.ydoc.getMap("orderedTree");
    syncPages();
    tree.observeDeep(syncPages);
    return () => tree.unobserveDeep(syncPages);
});

function place() {
    const destinationPageId = pageId || pages[0]?.id;
    if (!destinationPageId) return;
    placeObjectOnPage(project.ydoc, destinationPageId, objectType, objectId, userManager.getCurrentUser()?.id ?? "anonymous");
    onclose();
}
</script>

<div class="backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onclose(); }}>
    <div class="dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="placement-title">
        <h2 id="placement-title">Place “{objectName}” on a Page</h2>
        <label>Page
            <select bind:value={pageId} data-testid="object-placement-page-picker">
                {#each pages as page (page.id)}
                    <option value={page.id}>{page.title}</option>
                {/each}
            </select>
        </label>
        <div class="actions">
            <button type="button" onclick={onclose}>Cancel</button>
            <button type="button" class="primary" disabled={pages.length === 0} onclick={place} data-testid="object-placement-confirm">Place</button>
        </div>
    </div>
</div>

<style>
.backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; background: rgb(0 0 0 / 45%); }
.dialog { width: min(26rem, calc(100vw - 2rem)); padding: 1.25rem; border-radius: .5rem; background: white; box-shadow: 0 10px 30px rgb(0 0 0 / 25%); }
h2 { margin: 0 0 1rem; font-size: 1.15rem; }
label { display: grid; gap: .4rem; }
select { padding: .5rem; }
.actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1.25rem; }
button { padding: .45rem .8rem; }
.primary { color: white; border-color: #2563eb; background: #2563eb; }
</style>
