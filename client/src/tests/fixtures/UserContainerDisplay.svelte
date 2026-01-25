<script lang="ts">
import { firestoreStore as moduleStore } from "../../stores/firestoreStore.svelte";
import { onMount } from "svelte";
// Workaround for double loading in Vitest + JSDOM: Use the instance exposed on window if available
const storeRef = (typeof window !== "undefined" && (window as any).__FIRESTORE_STORE__)
    ? (window as any).__FIRESTORE_STORE__
    : moduleStore;

// Local state updating UI by direct assignment (independent of $derived)
let idsLocal = $state<string[]>([]);
let defaultIdLocal = $state<string | undefined>(undefined);

// Fallback: Append defaultId to the end if it's not included in ids
function computeDisplayed(ids: string[], def?: string) {
    return def && !ids.includes(def) ? [...ids, def] : ids;
}

onMount(() => {
    const apply = () => {
        try {
            const u = (storeRef as any).userProject;
            idsLocal = Array.from(u?.accessibleProjectIds ?? []);
            defaultIdLocal = u?.defaultProjectId;
        } catch {}
    };
    // Initial application + update on additional notification
    apply();
    try { window.addEventListener('firestore-uc-changed', apply); } catch {}
    // NOTE: This CustomEvent is test-environment only. In production/development,
    // UIs must rely on firestoreStore.ucVersion + $derived for redraws (see AGENTS.md).

    return () => { try { window.removeEventListener('firestore-uc-changed', apply); } catch {} };
});
</script>
<div>
    <div data-testid="default">{defaultIdLocal}</div>
    <ul>
        {#each computeDisplayed(idsLocal, defaultIdLocal) as id (id)}
            <li>{id}</li>
        {/each}
    </ul>
</div>
