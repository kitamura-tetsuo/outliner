<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("OutlinerBase");

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
