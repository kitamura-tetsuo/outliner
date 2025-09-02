<script lang="ts">
// import { Tree } from "fluid-framework"; // Yjsモードでは無効化
import { onMount } from "svelte";
import {
    Item,
    Items,
    Tree, // Yjsモード専用のTree実装を使用
} from "../schema/app-schema";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
// import { fluidStore } from "../stores/fluidStore.svelte"; // Yjsモードでは無効化
import { store as generalStore } from "../stores/store.svelte";

let isVisible = $state(false);

function updateVisibility() {
    if (typeof window !== "undefined") {
        isVisible = window.innerWidth <= 768;
    }
}

onMount(() => {
    updateVisibility();
    const ro = new ResizeObserver(updateVisibility);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
});

function getCurrentUser() {
    // Yjsモードでは簡易ユーザー管理
    return "anonymous";
}

function findItem(node: Item, id: string): Item | undefined {
    if (node.id === id) return node;
    const children = node.items as Items;
    if (children) {
        for (const child of children as any) {
            const found = findItem(child, id);
            if (found) return found;
        }
    }
    return undefined;
}

function getActiveItem(): Item | undefined {
    const id = editorOverlayStore.activeItemId;
    if (!id) return undefined;
    const currentPage = generalStore.currentPage;
    if (!currentPage) return undefined;
    return findItem(currentPage, id);
}

function indent() {
    // Yjsモードでは簡略化
    console.log("Yjs mode: Indent function not implemented");
}

function outdent() {
    // Yjsモードでは簡略化
    console.log("Yjs mode: Outdent function not implemented");
}

function insertAbove() {
    // Yjsモードでは簡略化
    console.log("Yjs mode: Insert above function not implemented");
}

function insertBelow() {
    // Yjsモードでは簡略化
    console.log("Yjs mode: Insert below function not implemented");
}

function newChild() {
    // Yjsモードでは簡略化
    console.log("Yjs mode: New child function not implemented");
}
</script>

{#if isVisible}
    <div
        data-testid="mobile-action-toolbar"
        class="mobile-toolbar"
    >
        <button
            aria-label="Indent"
            onmousedown={e => {
                e.preventDefault();
                indent();
            }}
        >
            →
        </button>
        <button
            aria-label="Outdent"
            onmousedown={e => {
                e.preventDefault();
                outdent();
            }}
        >
            ←
        </button>
        <button
            aria-label="Insert Above"
            onmousedown={e => {
                e.preventDefault();
                insertAbove();
            }}
        >
            ↑
        </button>
        <button
            aria-label="Insert Below"
            onmousedown={e => {
                e.preventDefault();
                insertBelow();
            }}
        >
            ↓
        </button>
        <button
            aria-label="New Child"
            onmousedown={e => {
                e.preventDefault();
                newChild();
            }}
        >
            ＋
        </button>
    </div>
{/if}

<style>
.mobile-toolbar {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom) + 0px);
    left: 0;
    right: 0;
    display: flex;
    gap: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(5px);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    transition: transform 0.2s;
}
.mobile-toolbar button {
    min-width: 44px;
    min-height: 44px;
}
</style>
