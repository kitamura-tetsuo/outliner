<script lang="ts">
import { Tree } from "fluid-framework";
import { onMount } from "svelte";
import {
    Item,
    Items,
} from "../schema/app-schema";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import { fluidStore } from "../stores/fluidStore.svelte";
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
    return fluidStore.currentUser?.id ?? "anonymous";
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
    return findItem(generalStore.currentPage, id);
}

function indent() {
    const id = editorOverlayStore.activeItemId;
    if (!id || id === "page-title") return;
    const item = getActiveItem();
    if (!item) return;
    const parent = Tree.parent(item);
    if (!Tree.is(parent, Items)) return;
    const index = parent.indexOf(item);
    if (index <= 0) return;
    const previousItem = parent[index - 1];
    const prevItems = previousItem.items;
    if (prevItems && Tree.is(prevItems, Items)) {
        Tree.runTransaction(parent, () => {
            (prevItems as any).moveRangeToEnd(index, index + 1, parent);
        });
        generalStore.currentPage = generalStore.currentPage;
        editorOverlayStore.setActiveItem(id);
    }
}

function outdent() {
    const id = editorOverlayStore.activeItemId;
    if (!id || id === "page-title") return;
    const item = getActiveItem();
    if (!item) return;
    const parentList = Tree.parent(item);
    if (!Tree.is(parentList, Items)) return;
    const parentItem = Tree.parent(parentList);
    if (!parentItem || !Tree.is(parentItem, Item)) return;
    const grandParentList = Tree.parent(parentItem);
    if (!grandParentList || !Tree.is(grandParentList, Items)) return;
    const parentIndex = grandParentList.indexOf(parentItem);
    const itemIndex = parentList.indexOf(item);
    const sourceItem = parentList[itemIndex];
    if (sourceItem) {
        const targetArray = grandParentList as any;
        Tree.runTransaction(grandParentList, () => {
            targetArray.moveRangeToIndex(parentIndex + 1, itemIndex, itemIndex + 1, parentList);
        });
        generalStore.currentPage = generalStore.currentPage;
        editorOverlayStore.setActiveItem(id);
    }
}

function insertAbove() {
    const id = editorOverlayStore.activeItemId;
    const item = getActiveItem();
    if (!item) return;
    const parent = Tree.parent(item);
    if (!parent || !Tree.is(parent, Items)) return;
    const index = parent.indexOf(item);
    parent.addNode(getCurrentUser(), index);
    generalStore.currentPage = generalStore.currentPage;
    if (id) editorOverlayStore.setActiveItem(id);
}

function insertBelow() {
    const id = editorOverlayStore.activeItemId;
    const item = getActiveItem();
    if (!item) return;
    const parent = Tree.parent(item);
    if (!parent || !Tree.is(parent, Items)) return;
    const index = parent.indexOf(item);
    parent.addNode(getCurrentUser(), index + 1);
    generalStore.currentPage = generalStore.currentPage;
    if (id) editorOverlayStore.setActiveItem(id);
}

function newChild() {
    const id = editorOverlayStore.activeItemId;
    const item = getActiveItem();
    if (!item) return;
    const children = item.items as Items;
    if (children && Tree.is(children, Items)) {
        children.addNode(getCurrentUser(), 0);
        generalStore.currentPage = generalStore.currentPage;
        if (id) editorOverlayStore.setActiveItem(id);
    }
}
</script>

{#if isVisible}
    <div
        data-testid="mobile-action-toolbar"
        class="mobile-toolbar"
    >
        <button aria-label="Indent" on:mousedown|preventDefault={indent}>→</button>
        <button aria-label="Outdent" on:mousedown|preventDefault={outdent}>←</button>
        <button aria-label="Insert Above" on:mousedown|preventDefault={insertAbove}>↑</button>
        <button aria-label="Insert Below" on:mousedown|preventDefault={insertBelow}>↓</button>
        <button aria-label="New Child" on:mousedown|preventDefault={newChild}>＋</button>
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
