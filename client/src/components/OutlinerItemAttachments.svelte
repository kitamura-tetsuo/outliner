<script lang="ts">
import { safeDecodeURIComponent } from "../utils/urlUtils";


import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";
import { getLogger } from "../lib/logger";


interface HasObservableAttachments { attachments?: { toArray?: () => unknown[], observe?: (obs: unknown) => void, unobserve?: (obs: unknown) => void } }
interface HasUnobserve { unobserve?: (cb: () => void) => void }
interface HasToArrayAttachments { attachments?: { toArray?: () => unknown[] } }

const logger = getLogger("OutlinerItemAttachments");

const IS_TEST: boolean = (import.meta.env.MODE === 'test') ;

interface Props {
    modelId: string;
    item: Item;
}

let { modelId, item }: Props = $props();

// Attachment mirror (Yjs->UI)
let attachmentsMirror = $state<Array<{url: string, mime?: string, name?: string}>>([]);

// Subscribe to attachments via Yjs observe
onMount(() => {
    try {
        const yArr = (item as unknown as HasObservableAttachments)?.attachments;
        const read = () => {
            try {
                const arr = (yArr?.toArray?.() ?? []);
                attachmentsMirror = arr.map((u: unknown) => Array.isArray(u) ? { url: u[0], mime: u[1], name: u[2] } : { url: typeof u === "string" ? u : "" });
                logger.debug({ count: attachmentsMirror.length, id: modelId }, '[OutlinerItemAttachments][Yjs] attachments observe ->');
            } catch (_e) { /* ignore */ }
        };
        if (yArr && typeof yArr.observe === 'function' && typeof yArr.unobserve === 'function') {
            read(); // Initial reflection
            const yHandler = () => { read(); };
            yArr.observe(yHandler);
            return () => { try { (yArr as unknown as HasUnobserve)?.unobserve?.(yHandler); } catch (_e) { /* ignore */ } };
        } else {
            // Fallback: Reflect once even if observe is unavailable
            attachmentsMirror = (((item as unknown as HasToArrayAttachments)?.attachments?.toArray?.() ?? []) as unknown[]).map((u: unknown) => Array.isArray(u) ? { url: u[0], mime: u[1], name: u[2] } : { url: typeof u === "string" ? u : "" });
        }
    } catch (_e) { /* ignore */ }
});

// Event listener for test environment
onMount(() => {
    const onAtt = (_e: Event | CustomEvent) => {
        try {
            const eid = String((_e && (_e as CustomEvent).detail && (_e as CustomEvent).detail.id) ?? "");
            logger.debug({ eid, id: modelId }, '[OutlinerItemAttachments][TEST] item-attachments-changed received');
            if (eid && String(modelId) !== eid) return;
            const yArr = (item as unknown as HasObservableAttachments)?.attachments;
            const arr = (yArr?.toArray?.() ?? []);
            if (arr.length > 0) {
                attachmentsMirror = arr.map((u: unknown) => Array.isArray(u) ? { url: u[0], mime: u[1], name: u[2] } : { url: typeof u === "string" ? u : "" });
            }
            logger.debug({ count: attachmentsMirror.length, id: modelId }, '[OutlinerItemAttachments][TEST] mirror updated ->');
        } catch (_e) { /* ignore */ }
    };
    try {
        if (IS_TEST) window.addEventListener('item-attachments-changed', onAtt as EventListener, { passive: true });
    } catch (_e) { /* ignore */ }
    return () => { try { window.removeEventListener('item-attachments-changed', onAtt as EventListener); } catch (_e) { /* ignore */ } };
});

const attachments = $derived.by(() => {
    try {
        return attachmentsMirror as Array<{url: string, mime?: string, name?: string}>;
    } catch {
        return [] as Array<{url: string, mime?: string, name?: string}>;
    }
});

function getAttachmentLabel(url: string): string {
    try {
        if (!url) return "View attachment";
        if (url.startsWith("data:") || url.startsWith("blob:")) return "View attachment";

        const urlObj = new URL(url, "http://localhost"); // safe for relative URLs if any
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();
        if (filename) {
            return `View attachment: ${safeDecodeURIComponent(filename)}`;
        }
    } catch (_e) { /* ignore */ }
    return "View attachment";
}

function isImage(url: string, mime?: string): boolean {
    if (mime && mime.startsWith('image/')) return true;
    if (url.startsWith('data:image/')) return true;
    try {
        const urlObj = new URL(url, "http://localhost");
        const pathname = urlObj.pathname.toLowerCase();
        return pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.gif') || pathname.endsWith('.webp') || pathname.endsWith('.svg');
    } catch (_e) {
        return false;
    }
}
</script>

{#if attachments.length > 0}
    <div class="attachments">
        {#each attachments as att (att.url)}
            <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                class="attachment-link"
                aria-label={att.name || getAttachmentLabel(att.url)}
                title={att.name || getAttachmentLabel(att.url)}
                onmousedown={(e: Event) => e.stopPropagation()}
                onpointerdown={(e: Event) => e.stopPropagation()}
                onmouseup={(e: Event) => e.stopPropagation()}
                onclick={(e: Event) => e.stopPropagation()}
            >
                {#if isImage(att.url, att.mime)}
                    <img src={att.url} class="attachment-preview" alt="" onerror={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.display = 'none';
                        if (target.nextElementSibling) {
                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                    }} />
                    <div class="file-chip fallback-chip" style="display: none;">
                        <span class="file-icon">📄</span>
                        <span class="file-name">{att.name || getAttachmentLabel(att.url).replace('View attachment: ', '')}</span>
                    </div>
                {:else}
                    <div class="file-chip">
                        <span class="file-icon">📄</span>
                        <span class="file-name">{att.name || getAttachmentLabel(att.url).replace('View attachment: ', '')}</span>
                    </div>
                {/if}
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

.file-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background-color: #f3f4f6;
    color: #374151;
    font-size: 12px;
    height: 32px;
    box-sizing: border-box;
}

.file-icon {
    font-size: 14px;
}

.file-name {
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>

