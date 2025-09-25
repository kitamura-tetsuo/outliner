<script lang="ts">
import { firestoreStore as moduleStore } from "../../stores/firestoreStore.svelte";
// Vitest + JSDOM での 2 重ロード対策: window に公開されたインスタンスがあればそれを使う
const storeRef = (typeof window !== "undefined" && (window as any).__FIRESTORE_STORE__)
    ? (window as any).__FIRESTORE_STORE__
    : moduleStore;

// イベントレス: $derived で firestoreStore.ucVersion に依存
let ids = $derived.by(() => {
    (storeRef as any).ucVersion;
    const u = (storeRef as any).userContainer;
    return (u?.accessibleContainerIds ?? []) as string[];
});

let defaultId: string | undefined = $derived.by(() => {
    (storeRef as any).ucVersion;
    const u = (storeRef as any).userContainer;
    return u?.defaultContainerId as string | undefined;
});
</script>
<div>
    <div data-testid="default">{defaultId}</div>
    <ul>
        {#each ids as id}
            <li>{id}</li>
        {/each}
    </ul>
</div>
