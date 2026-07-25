<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("OutlinerBase");

    // moved to onMount to avoid initial-value capture warnings

    import { Item } from "../schema/app-schema";
        import { store as generalStore } from "../stores/store.svelte";
    import { onMount } from "svelte";

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

        onEdit?: () => void;
    }

    let {
        pageItem,
        projectName,
        pageName,
        isReadOnly = false,

        onEdit,
    }: Props = $props();

    // moved to onMount to avoid initial-value capture warnings

    // Fallback: if pageItem is not yet provided, ensure a minimal page from global store
    // Automatically adopt currentPage from the global store while props.pageItem is missing
    let isServerResetting = $state(false);

    let effectivePageItem: Item | undefined = $derived.by(() => {
        const byProp = pageItem as Item | undefined;
        if (byProp) return byProp;
        return (generalStore.currentPage as Item | undefined) ?? undefined;
    });

    $effect(() => {
        if (!effectivePageItem) return;
        const currentDoc = effectivePageItem.ydoc;
        if (!currentDoc) return;
        const meta = currentDoc.getMap("metadata");

        let resetTimeout: ReturnType<typeof setTimeout>;

        const updateResetting = () => {
            const isResetting = meta.get("isResetting");
            const resetStartedAt = meta.get("resetStartedAt") as number | undefined;
            const now = Date.now();
            clearTimeout(resetTimeout);

            if (isResetting && resetStartedAt && now - resetStartedAt < 60000) {
                isServerResetting = true;
                resetTimeout = setTimeout(updateResetting, 60000 - (now - resetStartedAt));
            } else {
                isServerResetting = false;
            }
        };
        updateResetting();
        meta.observe(updateResetting);
        return () => {
            clearTimeout(resetTimeout);
            meta.unobserve(updateResetting);
        };
    });

    // Ensure a minimal currentPage on mount (effectivePageItem follows thereafter)
    onMount(() => {
        logger.debug("OutlinerBase effectivePageItem:", effectivePageItem);
    });
</script>

<div class="outliner-base" data-testid="outliner-base">
    {#if effectivePageItem}
        {#key `${effectivePageItem?.ydoc ? (effectivePageItem.ydoc as { guid?: string }).guid ?? "" : ""}:${effectivePageItem?.id ?? `${projectName}:${pageName}`}`}
            <OutlinerTree
                pageItem={effectivePageItem}
                {projectName}
                {pageName}
                isReadOnly={isReadOnly || isServerResetting}
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
