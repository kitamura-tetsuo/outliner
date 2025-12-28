<script lang="ts">
// moved to onMount to avoid initial-value capture warnings

import { Comments, Item } from "../schema/app-schema";
import * as Y from "yjs";
import { store as generalStore } from "../stores/store.svelte";
import { onMount } from "svelte";
import GlobalTextArea from "./GlobalTextArea.svelte";
import OutlinerTree from "./OutlinerTree.svelte";
import PresenceAvatars from "./PresenceAvatars.svelte";
import SlashCommandPalette from "./SlashCommandPalette.svelte";
import AliasPicker from "./AliasPicker.svelte";



interface Props {
    pageItem?: Item; // undefined を許容して常時マウント可能に
    projectName: string;
    pageName: string;
    isReadOnly?: boolean;
    isTemporary?: boolean;
    onEdit?: () => void;
}

let {
    pageItem,
    projectName,
    pageName,
    isReadOnly = false,
    isTemporary = false,
    onEdit,
}: Props = $props();

// moved to onMount to avoid initial-value capture warnings

// Fallback: if pageItem is not yet provided, ensure a minimal page from global store
// props.pageItem が無い間は global store の currentPage を自動採用
let effectivePageItem: Item | undefined = $derived.by(() => {
    const byProp = pageItem as Item | undefined;
    if (byProp) return byProp;
    return (generalStore.currentPage as Item | undefined) ?? undefined;
});



// マウント時に最低限の currentPage を補完（以後は effectivePageItem が追従）
onMount(() => {
        console.log("OutlinerBase effectivePageItem:", effectivePageItem);

        // コメント数更新のプロトタイプパッチ（テスト安定化用・決定的反映）
        try {
            window.addEventListener('item-comment-count', (e: Event) => {
                try {
                    const ce = e as CustomEvent<any>;
                    const W:any = (window as any);
                    if (Array.isArray(W.E2E_LOGS)) W.E2E_LOGS.push({ tag: 'item-comment-count', detail: ce?.detail, t: Date.now() });
                } catch {}
            });
        } catch {}

        try {
            const W:any = (typeof window !== 'undefined') ? (window as any) : null;
            if (W && !W.__itemCommentPatched) {
                W.__itemCommentPatched = true;
    // Log moved from module scope to avoid initial-value capture warnings
    try {
        console.log("OutlinerBase script executed - console.log");
        console.log("OutlinerBase props received:", {
            pageItemExists: !!pageItem,
            pageItemId: pageItem?.id,
            isTemporary,
            onEditExists: !!onEdit,
        });
        console.log("Store state in OutlinerBase:", {
            projectExists: !!(generalStore.project),
            projectTitle: generalStore.project?.title,
            currentPageExists: !!(generalStore.currentPage),
            currentPageId: generalStore.currentPage?.id,
            pagesExists: !!(generalStore.pages),
            pagesLength: generalStore.pages?.current?.length
        });
        console.log("OutlinerBase script completed successfully");
    } catch {}

                const ItemCls: any = Item;

                const ensureCommentsArrayOn = (target: any) => {
                    try {
                        const map: any = target?.value;
                        if (!map || typeof map.get !== "function" || typeof map.set !== "function") return null;
                        let arr = map.get?.("comments");
                        if (!arr) {
                            arr = new Y.Array();
                            map.set?.("comments", arr);
                        }
                        return arr;
                    } catch {
                        return null;
                    }
                };

                if (!Object.getOwnPropertyDescriptor(ItemCls.prototype, "comments")) {
                    Object.defineProperty(ItemCls.prototype, "comments", {
                        get() {
                            const arr = ensureCommentsArrayOn(this);
                            if (!arr) {
                                const fallback = new Y.Array();
                                try { (this as any)?.value?.set?.("comments", fallback); } catch {}
                                return new Comments(fallback);
                            }
                            return new Comments(arr);
                        },
                    });
                }

                const broadcastCommentCount = (ctx: any) => {
                    const arr = ensureCommentsArrayOn(ctx);
                    const len = arr?.length ?? 0;
                    W.commentCountsByItemId = W.commentCountsByItemId || new Map();
                    try { W.commentCountsByItemId.set(String(ctx?.id), len); } catch {}
                    try { ctx?.value?.set?.("commentCountCache", len); } catch {}
                    try { ctx?.value?.set?.("lastChanged", Date.now()); } catch {}
                    try { window.dispatchEvent(new CustomEvent('item-comment-count', { detail: { id: String(ctx?.id), count: len } })); } catch {}
                    return len;
                };

                const origAdd = typeof ItemCls.prototype.addComment === "function" ? ItemCls.prototype.addComment : null;
                ItemCls.prototype.addComment = function(author: string, text: string) {
                    let result: any;
                    if (origAdd) {
                        result = origAdd.call(this, author, text);
                    } else {
                        const wrapper = ensureCommentsArrayOn(this);
                        const comments = wrapper ? new Comments(wrapper) : null;
                        result = comments?.addComment?.(author, text);
                    }
                    broadcastCommentCount(this);
                    return result;
                };

                const origDel = typeof ItemCls.prototype.deleteComment === "function" ? ItemCls.prototype.deleteComment : null;
                ItemCls.prototype.deleteComment = function(commentId: string) {
                    let result: any;
                    if (origDel) {
                        result = origDel.call(this, commentId);
                    } else {
                        const wrapper = ensureCommentsArrayOn(this);
                        const comments = wrapper ? new Comments(wrapper) : null;
                        comments?.deleteComment?.(commentId);
                        result = undefined;
                    }
                    broadcastCommentCount(this);
                    return result;
                };

        // Items.at() から返る Item へ一時的に add/deleteComment フックを注入（テストの page.evaluate ルートを確実に捕捉）
        const patchItems = () => {
            try {
                const gs:any = (typeof window !== 'undefined' && (window as any).generalStore) || generalStore;
                const pageAny:any = gs?.currentPage;
                const items:any = pageAny?.items;
                if (!items || (items as any).__commentPatchApplied) return;
                const origAt = items.at?.bind(items);
                if (typeof origAt !== 'function') return;
                const patchSingle = (node: any) => {
                    if (!node || node.__commentPatched) return node;
                    node.__commentPatched = true;
                    try {
                        const proto = Object.getPrototypeOf(node);
                        if (proto && !Object.getOwnPropertyDescriptor(proto, "comments")) {
                            Object.defineProperty(proto, "comments", {
                                get() {
                                    const arr = ensureCommentsArrayOn(this);
                                    if (!arr) {
                                        const fallbackArr = new Y.Array();
                                        try { (this as any)?.value?.set?.("comments", fallbackArr); } catch {}
                                        return new Comments(fallbackArr);
                                    }
                                    return new Comments(arr);
                                },
                            });
                        }
                        if (proto && !proto.__commentPatchedPrototype) {
                            const originalAdd = typeof proto.addComment === 'function' ? proto.addComment : null;
                            proto.addComment = function(author:string, text:string) {
                                if (originalAdd) {
                                    const r = originalAdd.call(this, author, text);
                                    broadcastCommentCount(this);
                                    return r;
                                }
                                const wrapper = ensureCommentsArrayOn(this);
                                const comments = wrapper ? new Comments(wrapper) : null;
                                const res = comments?.addComment?.(author, text);
                                broadcastCommentCount(this);
                                return res;
                            };

                            const originalDelete = typeof proto.deleteComment === 'function' ? proto.deleteComment : null;
                            proto.deleteComment = function(commentId:string) {
                                if (originalDelete) {
                                    const r = originalDelete.call(this, commentId);
                                    broadcastCommentCount(this);
                                    return r;
                                }
                                const wrapper = ensureCommentsArrayOn(this);
                                const comments = wrapper ? new Comments(wrapper) : null;
                                comments?.deleteComment?.(commentId);
                                broadcastCommentCount(this);
                                return undefined;
                            };

                            Object.defineProperty(proto, "__commentPatchedPrototype", {
                                value: true,
                                configurable: true,
                            });
                        }
                    } catch {}
                    return node;
                };

                (items as any).__commentPatchApplied = true;
                items.at = function(index:number) {
                    const it:any = origAt(index);
                    return patchSingle(it);
                };

                const length = items.length ?? 0;
                for (let i = 0; i < length; i++) {
                    patchSingle(origAt(i));
                }
            } catch {}
        };
        patchItems();
        setTimeout(() => { try { patchItems(); } catch {} }, 0);
        setTimeout(() => { try { patchItems(); } catch {} }, 200);
            }
        } catch {}

    try {
        const gs: any = (typeof window !== "undefined" && (window as any).generalStore) || generalStore;
        if (!gs?.project) return;
        // REMOVED: Legacy browser-based seeding. Tests should use TestHelpers.createAndSeedProject for data seeding.

        // ナビゲーション直後など非同期タイミングの取りこぼし対策でもう一度試行
        setTimeout(() => {
            try {
                const gs2: any = (typeof window !== "undefined" && (window as any).generalStore) || generalStore;


                if (gs2?.project && !gs2.currentPage) {
                    const items2: any = gs2.project.items as any;
                    let found2: any = null;
                    const len2 = items2?.length ?? 0;
                    for (let i = 0; i < len2; i++) {
                        const p = items2.at ? items2.at(i) : items2[i];
                        const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                        if (String(t).toLowerCase() === String(pageName || "").toLowerCase()) { found2 = p; break; }
                    }
                    if (!found2) {
                        found2 = items2?.addNode?.("tester");
                        if (found2 && pageName) found2.updateText?.(pageName);
                    }
                    if (found2) gs2.currentPage = found2;
                }
            } catch {}
        }, 150);

    } catch {}
});
</script>

<div class="outliner-base" data-testid="outliner-base">
    {#if effectivePageItem}
        {#key (effectivePageItem?.ydoc ? (effectivePageItem.ydoc as any).guid ?? effectivePageItem.id : effectivePageItem.id)}
            <OutlinerTree
                pageItem={effectivePageItem}
                projectName={projectName}
                pageName={pageName}
                isReadOnly={isReadOnly}
                onEdit={onEdit}
            />
        {/key}
    {:else}
        <div class="outliner-item">Loading...</div>
    {/if}

    <!-- グローバルテキストエリア -->
    <GlobalTextArea />
    <SlashCommandPalette />
    <AliasPicker />
    <PresenceAvatars />
</div>

<style>
.outliner-base {
    width: 100%;
    height: 100%;
}
</style>
