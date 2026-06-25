<script lang="ts">

import { onMount, onDestroy } from "svelte";
import type { Item } from "../schema/app-schema";
import { store as generalStore } from "../stores/store.svelte";
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import OutlinerTree from "./OutlinerTree.svelte";
import { getLogger } from "../lib/logger";

const logger = getLogger("OutlinerItemAlias");

interface Props {
    modelId: string;
    item: Item;
    isReadOnly?: boolean;
    isCollapsed?: boolean;
}

let { modelId, item, isReadOnly = false, isCollapsed = false }: Props = $props();

// Subscription to aliasTargetId via Yjs observe
let aliasTargetId = $state<string | undefined>();

onMount(() => {
    aliasTargetId = item.aliasTargetId;
    try {
        const anyItem = item as unknown as { tree?: { getNodeValueFromKey?: (key: unknown) => { observe?: (cb: unknown) => void, unobserve?: (cb: unknown) => void } }, key?: unknown };
        const ymap = anyItem?.tree?.getNodeValueFromKey?.(anyItem?.key);
        if (ymap && typeof ymap.observe === 'function') {
            const obs = (e?: { keysChanged?: { has?: (key: string) => boolean } }) => {
                try {
                    if (!e || (e.keysChanged && e.keysChanged.has && e.keysChanged.has('aliasTargetId'))) {
                        const newValue = (ymap as unknown as { get?: (k: string) => string }).get?.('aliasTargetId');
                        if (newValue !== aliasTargetId) {
                            aliasTargetId = newValue;
                            logger.debug({ itemId: modelId, newValue }, "OutlinerItemAlias: aliasTargetId updated via observe");
                        }
                    }
                } catch {}
            };
            ymap.observe(obs);
            obs(); // Initial reflection
            onDestroy(() => { try { (ymap as unknown as { unobserve?: (cb: unknown) => void })?.unobserve?.(obs); } catch {} });
        }
    } catch {}
});


const aliasTargetIdEffective = $derived.by(() => {
    void aliasPickerStore?.tick;
    const base = aliasTargetId;
    if (base) return base;

    const lastItemId = aliasPickerStore?.lastConfirmedItemId;
    const lastTargetId = aliasPickerStore?.lastConfirmedTargetId;
    const lastAt = aliasPickerStore?.lastConfirmedAt;

    if (lastTargetId && lastAt && Date.now() - lastAt < 6000 && lastItemId === modelId) {
        return lastTargetId;
    }

    return undefined;
});

const aliasTarget = $derived.by(() => {
    try {
        const page = generalStore.currentPage;
        const targetId = aliasTargetIdEffective;
        if (page && targetId) {
            return findItem(page, targetId);
        }
    } catch (e) {
        logger.warn({ error: e as Error }, "OutlinerItemAlias: alias target resolve error");
    }
    return undefined;
});

const aliasPath = $derived.by(() => {
    void aliasPickerStore?.tick;
    void aliasTargetIdEffective;
    
    try {
        const page = generalStore.currentPage;
        const targetId = aliasTargetIdEffective;
        if (targetId && page) {
            const p = findPath(page, targetId);
            if (p && p.length > 0) return p;
            
            // Fallback
            const fallbackTarget = findItem(page, targetId);
            if (fallbackTarget) return [fallbackTarget];
        }
    } catch (e) {
        logger.warn({ error: e as Error }, "OutlinerItemAlias: alias path resolve error");
    }
    return [] as Item[];
});

function findItem(node: Item, id: string): Item | undefined {
    if (node.id === id) return node;
    const children = node.items;
    if (children) {
        for (const child of children as unknown as Iterable<Item>) {
            const found = findItem(child, id);
            if (found) return found;
        }
    }
    return undefined;
}

function findPath(node: Item, id: string, path: Item[] = []): Item[] | null {
    if (!node) return null;
    if (node.id === id) return [...path, node];
    const children = node.items;
    if (children) {
        const len = Number.isFinite((children as unknown as { length?: number })?.length) ? (children as unknown as { length: number }).length : 0;
        for (let i = 0; i < len; i++) {
            let child: Item | undefined;
            try {
                child = (children as unknown as { at?: (idx: number) => Item, [idx: number]: Item }).at ? (children as unknown as { at: (idx: number) => Item }).at(i) : (children as unknown as { [idx: number]: Item })[i];
            } catch { child = undefined; }
            if (!child) continue;
            const res = findPath(child, id, [...path, node]);
            if (res) return res;
        }
    }
    return null;
}
</script>

{#if aliasTargetIdEffective}
    <div class="alias-path" data-alias-owner-id={modelId}>
        {#if aliasPath.length > 0}
            {#each aliasPath as p, i (p.id)}
                <button type="button" onclick={() => { /* dispatch navigate-to-item */ }}>
                    {p.text || "Loading..."}
                </button>{i < aliasPath.length - 1 ? "/" : ""}
            {/each}
        {:else}
            <button type="button">
                {findItem(generalStore.currentPage as unknown as Item, aliasTargetIdEffective)?.text || "Loading..."}
            </button>
        {/if}
    </div>
    <div class="alias-subtree">
        {#if !isCollapsed}
            {#if aliasTarget}
                <OutlinerTree pageItem={aliasTarget} isReadOnly={isReadOnly} />
            {:else}
                <div class="alias-subtree-placeholder" style="min-height: 8px;">&nbsp;</div>
            {/if}
        {:else}
            <div class="alias-subtree-placeholder" style="min-height: 4px;">&nbsp;</div>
        {/if}
    </div>
{/if}

<style>
.alias-path {
    margin-top: 4px;
    font-size: 0.8rem;
    color: #555;
}
.alias-path button {
    color: #06c;
    text-decoration: underline;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
}
.alias-subtree {
    margin-left: 24px;
    min-height: 8px;
}
</style>

