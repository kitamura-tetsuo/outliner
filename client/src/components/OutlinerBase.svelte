<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("OutlinerBase");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // moved to onMount to avoid initial-value capture warnings

    import { Comments, Item } from "../schema/app-schema";
    import * as Y from "yjs";
    import { store as generalStore } from "../stores/store.svelte";
    import { onMount } from "svelte";
    import { extractPagePreview } from "../lib/pagePreview";
    import GlobalTextArea from "./GlobalTextArea.svelte";
    import OutlinerTree from "./OutlinerTree.svelte";
    import PresenceAvatars from "./PresenceAvatars.svelte";
    import SlashCommandPalette from "./SlashCommandPalette.svelte";
    import AliasPicker from "./AliasPicker.svelte";

    interface Props {
        pageItem?: Item; // Allow undefined to enable constant mounting
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
    // Automatically adopt currentPage from the global store while props.pageItem is missing
    let effectivePageItem: Item | undefined = $derived.by(() => {
        const byProp = pageItem as Item | undefined;
        if (byProp) return byProp;
        return (generalStore.currentPage as Item | undefined) ?? undefined;
    });

    let previewUpdateTimeout: ReturnType<typeof setTimeout>;

    $effect(() => {
        if (!effectivePageItem) return;

        const currentDoc = effectivePageItem.ydoc;
        if (!currentDoc) return;

        const updatePreviewDebounced = () => {
            clearTimeout(previewUpdateTimeout);
            previewUpdateTimeout = setTimeout(() => {
                if (!effectivePageItem) return;
                try {
                    const newPreview = extractPagePreview(effectivePageItem);
                    const oldPreview = effectivePageItem.preview;
                    if (JSON.stringify(newPreview) !== JSON.stringify(oldPreview)) {
                        effectivePageItem.preview = newPreview;
                    }
                } catch (e) {
                    logger.warn("Failed to update page preview:", e);
                }
            }, 1000);
        };

        currentDoc.on("update", updatePreviewDebounced);
        return () => {
            clearTimeout(previewUpdateTimeout);
            currentDoc.off("update", updatePreviewDebounced);
        };
    });

    // Ensure a minimal currentPage on mount (effectivePageItem follows thereafter)
    onMount(() => {
        logger.debug("OutlinerBase effectivePageItem:", effectivePageItem);

        // Prototype patch for updating comment counts (for test stabilization and deterministic reflection)
        try {
            window.addEventListener("item-comment-count", (e: Event) => {
                try {
                    const ce = e as CustomEvent<unknown>;
                    const W = window as Window & typeof globalThis & { E2E_LOGS?: unknown[] };
                    if (Array.isArray(W.E2E_LOGS))
                        W.E2E_LOGS.push({
                            tag: "item-comment-count",
                            detail: ce?.detail,
                            t: Date.now(),
                        });
                } catch {}
            });
        } catch {}

        // Item comments patching - wrapped in try for safety
        try {
            const W = typeof window !== "undefined" ? window : null;
            if (W && !W.__itemCommentPatched) {
                W.__itemCommentPatched = true;

                // Log for debugging
                try {
                    logger.debug("OutlinerBase script executed - logger.debug");
                    logger.debug("OutlinerBase props received:", {
                        pageItemExists: !!pageItem,
                        pageItemId: pageItem?.id,
                        isTemporary,
                        onEditExists: !!onEdit,
                    });
                    logger.debug("Store state in OutlinerBase:", {
                        projectExists: !!generalStore.project,
                        projectTitle: generalStore.project?.title,
                        currentPageExists: !!generalStore.currentPage,
                        currentPageId: generalStore.currentPage?.id,
                        pagesExists: !!generalStore.pages,
                        pagesLength: generalStore.pages?.current?.length,
                    });
                    logger.debug("OutlinerBase script completed successfully");
                } catch {}

                const ItemCls = Item as unknown as Record<string, unknown> & { prototype: Record<string, unknown> };

                const ensureCommentsArrayOn = (target: unknown) => {
                    try {
                        const map = (target as Record<string, unknown>)?.value as Y.Map<unknown> | undefined;
                        if (
                            !map ||
                            typeof map.get !== "function" ||
                            typeof map.set !== "function"
                        )
                            return null;
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

                if (
                    !Object.getOwnPropertyDescriptor(
                        ItemCls.prototype,
                        "comments",
                    )
                ) {
                    Object.defineProperty(ItemCls.prototype, "comments", {
                        get() {
                            const map = (this as Record<string, unknown>)?.value as Y.Map<unknown> | undefined;
                            const arr = map?.get?.("comments");
                            if (!arr) {
                                const fallback = new Y.Array<Y.Map<import('../types/yjs-types.js').CommentValueType>>();
                                // Do not write to map in getter to avoid infinite loops in Observers
                                return new Comments(fallback as any, "comments");
                            }
                            return new Comments(arr as any, "comments");
                        },
                    });
                }

                const broadcastCommentCount = (ctx: unknown) => {
                    const arr = ensureCommentsArrayOn(ctx as any);
                    const len = (arr as any)?.length ?? 0;
                    W.commentCountsByItemId =
                        W.commentCountsByItemId || new Map();
                    try {
                        W.commentCountsByItemId.set(String((ctx as any)?.id), len);
                    } catch {}
                    try {
                        (ctx as any)?.value?.set?.("commentCountCache", len);
                    } catch {}
                    try {
                        (ctx as any)?.value?.set?.("lastChanged", Date.now());
                    } catch {}
                    try {
                        window.dispatchEvent(
                            new CustomEvent("item-comment-count", {
                                detail: { id: String((ctx as any)?.id), count: len },
                            }),
                        );
                    } catch {}
                    return len;
                };

                const origAdd =
                    typeof ItemCls.prototype.addComment === "function"
                        ? ItemCls.prototype.addComment
                        : null;
                ItemCls.prototype.addComment = function (
                    author: string,
                    text: string,
                ) {
                    let result: unknown;
                    if (origAdd) {
                        result = origAdd.call(this, author, text);
                    } else {
                        const wrapper = ensureCommentsArrayOn(this as any);
                        const comments = wrapper ? new Comments(wrapper as any, "comments") : null;
                        result = comments?.addComment?.(author, text);
                    }
                    broadcastCommentCount(this);
                    return result;
                };

                const origDel =
                    typeof ItemCls.prototype.deleteComment === "function"
                        ? ItemCls.prototype.deleteComment
                        : null;
                ItemCls.prototype.deleteComment = function (commentId: string) {
                    let result: unknown;
                    if (origDel) {
                        result = origDel.call(this, commentId);
                    } else {
                        const wrapper = ensureCommentsArrayOn(this as any);
                        const comments = wrapper ? new Comments(wrapper as any, "comments") : null;
                        comments?.deleteComment?.(commentId);
                        result = undefined;
                    }
                    broadcastCommentCount(this);
                    return result;
                };

                // Temporarily inject add/deleteComment hooks into the Item returned from Items.at()
                const patchItems = () => {
                    try {
                        const gs =
                            (typeof window !== "undefined" && window.generalStore) ||
                            generalStore;
                        const pageAny = (gs as { currentPage?: unknown })?.currentPage;
                        const items = (pageAny as { items?: unknown })?.items;
                        if (!items || (items as { __commentPatchApplied?: boolean }).__commentPatchApplied)
                            return;
                        const origAt = (items as { at?: (index: number) => unknown }).at?.bind(items);
                        if (typeof origAt !== "function") return;
                        const patchSingle = (node: unknown) => {
                            if (!node || (node as { __commentPatched?: boolean }).__commentPatched) return node;
                            (node as { __commentPatched?: boolean }).__commentPatched = true;
                            try {
                                const proto = Object.getPrototypeOf(node);
                                if (
                                    proto &&
                                    !Object.getOwnPropertyDescriptor(
                                        proto,
                                        "comments",
                                    )
                                ) {
                                    Object.defineProperty(proto, "comments", {
                                        get() {
                                            const arr =
                                                ensureCommentsArrayOn(this as any);
                                            if (!arr) {
                                                const fallbackArr =
                                                    new Y.Array<Y.Map<import('../types/yjs-types.js').CommentValueType>>();
                                                // Do not write to map in getter to avoid infinite loops in Observers
                                                return new Comments(fallbackArr as any, "comments");
                                            }
                                            return new Comments(arr as any, "comments");
                                        },
                                    });
                                }
                                if (proto && !proto.__commentPatchedPrototype) {
                                    const originalAdd =
                                        typeof proto.addComment === "function"
                                            ? proto.addComment
                                            : null;
                                    proto.addComment = function (
                                        author: string,
                                        text: string,
                                    ) {
                                        if (originalAdd) {
                                            const r = originalAdd.call(
                                                this,
                                                author,
                                                text,
                                            );
                                            broadcastCommentCount(this);
                                            return r;
                                        }
                                        const wrapper =
                                            ensureCommentsArrayOn(this as any);
                                        const comments = wrapper
                                            ? new Comments(wrapper as any, "comments")
                                            : null;
                                        const res = comments?.addComment?.(
                                            author,
                                            text,
                                        );
                                        broadcastCommentCount(this);
                                        return res;
                                    };

                                    const originalDelete =
                                        typeof proto.deleteComment ===
                                        "function"
                                            ? proto.deleteComment
                                            : null;
                                    proto.deleteComment = function (
                                        commentId: string,
                                    ) {
                                        if (originalDelete) {
                                            const r = originalDelete.call(
                                                this,
                                                commentId,
                                            );
                                            broadcastCommentCount(this);
                                            return r;
                                        }
                                        const wrapper =
                                            ensureCommentsArrayOn(this as any);
                                        const comments = wrapper
                                            ? new Comments(wrapper as any, "comments")
                                            : null;
                                        comments?.deleteComment?.(commentId);
                                        broadcastCommentCount(this);
                                        return undefined;
                                    };

                                    Object.defineProperty(
                                        proto,
                                        "__commentPatchedPrototype",
                                        {
                                            value: true,
                                            configurable: true,
                                        },
                                    );
                                }
                            } catch {}
                            return node;
                        };

                        (items as { __commentPatchApplied?: boolean }).__commentPatchApplied = true;
                        (items as { at?: (index: number) => unknown }).at = function (index: number) {
                            const it = origAt(index);
                            return patchSingle(it);
                        };

                        const length = (items as { length?: number }).length ?? 0;
                        for (let i = 0; i < length; i++) {
                            patchSingle(origAt(i));
                        }
                    } catch {}
                };
                patchItems();
                setTimeout(() => {
                    try {
                        patchItems();
                    } catch {}
                }, 0);
                setTimeout(() => {
                    try {
                        patchItems();
                    } catch {}
                }, 200);
            }
        } catch {}
    });
</script>

<div class="outliner-base" data-testid="outliner-base">
    {#if effectivePageItem}
        {#key effectivePageItem?.ydoc ? ((effectivePageItem.ydoc as unknown as { guid?: string }).guid ?? effectivePageItem.id) : effectivePageItem.id}
            <OutlinerTree
                pageItem={effectivePageItem}
                {projectName}
                {pageName}
                {isReadOnly}
                {onEdit}
            />
        {/key}
    {:else}
        <div class="outliner-item">Loading...</div>
    {/if}

    <!-- Global Text Area -->
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
