<script lang="ts">
import { firestoreStore as moduleStore } from "../../stores/firestoreStore.svelte";
import { onMount } from "svelte";
// Vitest + JSDOM での 2 重ロード対策: window に公開されたインスタンスがあればそれを使う
const storeRef = (typeof window !== "undefined" && (window as any).__FIRESTORE_STORE__)
    ? (window as any).__FIRESTORE_STORE__
    : moduleStore;

// 直接代入で UI を更新するローカル状態（$derived に依存しない）
let idsLocal = $state<string[]>([]);
let defaultIdLocal = $state<string | undefined>(undefined);

// フォールバック: defaultId が ids に含まれない場合に末尾へ追加
function computeDisplayed(ids: string[], def?: string) {
    return def && !ids.includes(def) ? [...ids, def] : ids;
}

onMount(() => {
    const apply = () => {
        try {
            const u = (storeRef as any).userContainer;
            idsLocal = Array.from(u?.accessibleContainerIds ?? []);
            defaultIdLocal = u?.defaultContainerId;
        } catch {}
    };
    // 初期適用 + 追加通知での更新
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
