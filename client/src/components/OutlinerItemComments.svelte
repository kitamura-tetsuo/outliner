<script lang="ts">
    import { store as generalStore } from "../stores/store.svelte";
    import { getLogger } from "../lib/logger";
    import CommentThread from "./CommentThread.svelte";

    const logger = getLogger("OutlinerItemComments");

    let {
        modelId,
        index,
        item,
        ensuredComments,
        currentUser,
        isCommentsVisible
    }: {
        modelId: string;
        index: number;
        item: any;
        ensuredComments: any;
        currentUser: string;
        isCommentsVisible: boolean;
    } = $props();

    function hasOpenComment(store: any): boolean {
        return store && typeof store === 'object' && 'openCommentItemId' in store;
    }

    export function toggleComments() {
        if (hasOpenComment(generalStore)) {
            if (generalStore.openCommentItemId === modelId) {
                generalStore.openCommentItemId = null;
                try { logger.debug(undefined, '[OutlinerItemComments] toggleComments id=' + modelId + ' -> false'); } catch {}
            } else {
                generalStore.openCommentItemId = modelId;
                try { logger.debug(undefined, '[OutlinerItemComments] toggleComments id=' + modelId + ' -> true index=' + index); } catch {}
            }
        }
    }
</script>

{#if isCommentsVisible}
    <!-- XSS-safe: This only returns an empty string, used to trigger reactivity on item.comments -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html (() => { try { void item.comments; } catch {} return ''; })() }
    <CommentThread
        comments={ensuredComments}
        item={item}
        currentUser={currentUser}
    />
{/if}
