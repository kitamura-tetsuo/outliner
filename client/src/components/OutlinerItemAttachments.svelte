<script lang="ts">
import { onMount, onDestroy } from "svelte";
import type { Item } from "../schema/app-schema";
import { getLogger } from "../lib/logger";

const logger = getLogger("OutlinerItemAttachments");

const IS_TEST: boolean = (import.meta.env.MODE === 'test') || ((typeof window !== 'undefined') && ((window as Window & typeof globalThis & { __E2E__?: boolean }).__E2E__ === true));

interface Props {
    modelId: string;
    item: Item;
}

let { modelId, item }: Props = $props();

// Attachment mirror (Yjs->UI)
let attachmentsMirror = $state<string[]>([]);

// Subscribe to attachments via Yjs observe
onMount(() => {
    try {
        const yArr = (item as unknown as { attachments?: { toArray?: () => unknown[], observe?: (obs: unknown) => void, unobserve?: (obs: unknown) => void } })?.attachments;
        const read = () => {
            try {
                const arr = (yArr?.toArray?.() ?? []);
                attachmentsMirror = arr.map((u: unknown) => Array.isArray(u) ? u[0] : u);
                logger.debug({ count: attachmentsMirror.length, id: modelId }, '[OutlinerItemAttachments][Yjs] attachments observe ->');
            } catch {}
        };
        if (yArr && typeof yArr.observe === 'function' && typeof yArr.unobserve === 'function') {
            read(); // Initial reflection
            const yHandler = () => { read(); };
            yArr.observe(yHandler);
            onDestroy(() => { try { (yArr as any)?.unobserve?.(yHandler); } catch {} });
        } else {
            // Fallback: Reflect once even if observe is unavailable
            attachmentsMirror = (((item as unknown as { attachments?: { toArray?: () => unknown[] } })?.attachments?.toArray?.() ?? []) as unknown[]).map((u: unknown) => Array.isArray(u) ? u[0] : u);
        }
    } catch {}
});

// Event listener for test environment
onMount(() => {
    const onAtt = (_e: Event | CustomEvent) => {
        try {
            const eid = String((_e && (_e as CustomEvent).detail && (_e as CustomEvent).detail.id) ?? "");
            logger.debug({ eid, id: modelId }, '[OutlinerItemAttachments][TEST] item-attachments-changed received');
            if (eid && String(modelId) !== eid) return;
            const yArr = (item as unknown as { attachments?: { toArray?: () => unknown[], observe?: (obs: unknown) => void, unobserve?: (obs: unknown) => void } })?.attachments;
            const arr = (yArr?.toArray?.() ?? []);
            if (arr.length > 0) {
                attachmentsMirror = arr.map((u: unknown) => Array.isArray(u) ? u[0] : u);
            }
            logger.debug({ count: attachmentsMirror.length, id: modelId }, '[OutlinerItemAttachments][TEST] mirror updated ->');
        } catch {}
    };
    try {
        if (IS_TEST) window.addEventListener('item-attachments-changed', onAtt as EventListener, { passive: true });
    } catch {}
    onDestroy(() => { try { window.removeEventListener('item-attachments-changed', onAtt as EventListener); } catch {} });
});

const attachments = $derived.by(() => {
    try {
        return attachmentsMirror as string[];
    } catch {
        return [] as string[];
    }
});

function getAttachmentLabel(url: string): string {
    try {
        if (!url) return "View attachment";
        if (url.startsWith("data:") || url.startsWith("blob:")) return "View attachment";

        const urlObj = new URL(url, window.location.origin); // safe for relative URLs if any
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();
        if (filename) {
            return `View attachment: ${decodeURIComponent(filename)}`;
        }
    } catch {}
    return "View attachment";
}
</script>

{#if attachments.length > 0}
    <div class="attachments">
        {#each attachments as url (url)}
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                class="attachment-link"
                aria-label={getAttachmentLabel(url)}
                title={getAttachmentLabel(url)}
            >
                <img src={url} class="attachment-preview" alt="" />
            </a>
        {/each}
    </div>
{/if}

<style>
.attachments {
    margin-top: 4px;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.attachment-link {
    display: inline-block;
    text-decoration: none;
    line-height: 0;
    border-radius: 4px;
}

.attachment-link:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

.attachment-preview {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
}
</style>

