<script lang="ts">
import { onMount, onDestroy } from "svelte";
import type { Item } from "../schema/app-schema";
import { store as generalStore } from "../stores/store.svelte";
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import OutlinerTree from "./OutlinerTree.svelte";
import { getLogger } from "../lib/logger";
import type { YMap } from "yjs";
import type { ItemValueType } from "../types/yjs-types";

const logger = getLogger("OutlinerItemAlias");

interface Props {
    modelId: string;
    item: Item;
    isReadOnly?: boolean;
    isCollapsed?: boolean;
}

let { modelId, item, isReadOnly = false, isCollapsed = false }: Props = $props();

// Yjs observe による aliasTargetId の購読
let aliasTargetId = $state<string | undefined>(item.aliasTargetId);

onMount(() => {
    try {
        if (item.tree && item.key) {
            const ymap = item.tree.getNodeValueFromKey(item.key) as YMap<ItemValueType> | undefined;
            if (ymap && typeof ymap.observe === 'function') {
                const obs = (_e?: unknown) => { // eslint-disable-line @typescript-eslint/no-unused-vars
                    try {
                        const newValue = ymap.get?.('aliasTargetId');
                        if (newValue !== aliasTargetId) {
                            aliasTargetId = newValue;
                            logger.debug("OutlinerItemAlias: aliasTargetId updated via observe", { itemId: modelId, newValue });
                        }
                    } catch {}
                };
                ymap.observe(obs);
                obs(); // 初期反映
                onDestroy(() => { try { ymap.unobserve(obs); } catch {} });
            }
        }
    } catch {}
});

// 暫定フォールバック: lastConfirmed をポーリング
let aliasLastConfirmedPulse: { itemId: string; targetId: string; at: number } | null = $state(null);

onMount(() => {
    const iv = setInterval(() => {
        try {
            const ap = (typeof window !== 'undefined') ? (window as typeof globalThis & { aliasPickerStore?: { lastConfirmedItemId?: string; lastConfirmedTargetId?: string; lastConfirmedAt?: number } }).aliasPickerStore : undefined;
            const li = ap?.lastConfirmedItemId;
            const lt = ap?.lastConfirmedTargetId;
            const la = ap?.lastConfirmedAt;
            if (li && lt && la && (Date.now() - la < 6000) && li === modelId) {
                aliasLastConfirmedPulse = { itemId: li, targetId: lt, at: la };
            }
        } catch {}
    }, 100);
    onDestroy(() => { try { clearInterval(iv); } catch {} });
});

const aliasTargetIdEffective = $derived.by(() => {
    void aliasLastConfirmedPulse;
    const base = aliasTargetId;
    if (base) return base;

    const lastItemId = aliasPickerStore?.lastConfirmedItemId;
    const lastTargetId = aliasPickerStore?.lastConfirmedTargetId;
    const lastAt = aliasPickerStore?.lastConfirmedAt;

    if (lastTargetId && lastAt && Date.now() - lastAt < 6000 && lastItemId === modelId) {
        return lastTargetId;
    }

    if (aliasLastConfirmedPulse && (Date.now() - aliasLastConfirmedPulse.at < 6000) && aliasLastConfirmedPulse.itemId === modelId) {
        return aliasLastConfirmedPulse.targetId;
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
        logger.warn("OutlinerItemAlias: alias target resolve error", e);
    }
    return undefined;
});

const aliasPath = $derived.by(() => {
    void aliasLastConfirmedPulse;
    void aliasTargetIdEffective;

    try {
        const page = generalStore.currentPage;
        const targetId = aliasTargetIdEffective;
        if (targetId && page) {
            const p = findPath(page, targetId);
            if (p && p.length > 0) return p;

            // フォールバック
            const fallbackTarget = findItem(page, targetId);
            if (fallbackTarget) return [fallbackTarget];
        }
    } catch (e) {
        logger.warn("OutlinerItemAlias: alias path resolve error", e);
    }
    return [] as Item[];
});

function findItem(node: Item, id: string): Item | undefined {
    if (node.id === id) return node;
    const children = node.items;
    if (children) {
        for (const child of children) {
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
        const len = Number.isFinite(children.length) ? children.length : 0;
        for (let i = 0; i < len; i++) {
            let child: Item | undefined;
            try {
                child = children.at ? children.at(i) : children[i];
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
                {generalStore.currentPage ? findItem(generalStore.currentPage, aliasTargetIdEffective)?.text || "Loading..." : "Loading..."}
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

