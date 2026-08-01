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
interface AttachmentData {
    url: string;
    mime?: string;
    name?: string;
    isImageFallback?: boolean;
}

let attachmentsMirror = $state<AttachmentData[]>([]);

// Subscribe to attachments via Yjs observe
onMount(() => {
    try {
        const yArr = (item as unknown as HasObservableAttachments)?.attachments;
        const read = () => {
            try {
                const arr = (yArr?.toArray?.() ?? []);
                attachmentsMirror = arr.map(u => {
                    if (Array.isArray(u)) {
                        if (u.length >= 3) return { url: String(u[0]), mime: String(u[1]), name: String(u[2]) };
                        return { url: String(u[0]) };
                    }
                    return { url: String(u) };
                });
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
            attachmentsMirror = (((item as unknown as HasToArrayAttachments)?.attachments?.toArray?.() ?? []) as unknown[]).map((u: unknown) => Array.isArray(u) ? u[0] : u);
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
                attachmentsMirror = arr.map(u => {
                    if (Array.isArray(u)) {
                        if (u.length >= 3) return { url: String(u[0]), mime: String(u[1]), name: String(u[2]) };
                        return { url: String(u[0]) };
                    }
                    return { url: String(u) };
                });
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
        return attachmentsMirror as AttachmentData[];
    } catch {
        return [] as AttachmentData[];
    }
});

function getAttachmentLabel(url: string, name?: string): string {
    if (name) return name;
    try {
        if (!url) return "View attachment";
        if (url.startsWith("data:") || url.startsWith("blob:")) return "View attachment";

        const urlObj = new URL(url, window.location.origin); // safe for relative URLs if any
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();
        if (filename) {
            return `View attachment: ${safeDecodeURIComponent(filename)}`;
        }
    } catch (_e) { /* ignore */ }
    return "View attachment";
}

function isImage(att: AttachmentData): boolean {
    if (att.isImageFallback) return false;
    if (att.mime && att.mime.startsWith("image/")) return true;
    try {
        const urlObj = new URL(att.url, window.location.origin);
        const pathname = urlObj.pathname.toLowerCase();
        if (pathname.match(/\.(jpeg|jpg|gif|png|webp|svg|avif)$/)) return true;
    } catch { /* ignore */ }
    // If no mime type and no known extension, we still try to render as image for legacy URLs,
    // and rely on the onerror fallback to mark it as non-image if it fails.
    return !att.mime;
}

function handleImageError(att: AttachmentData) {
    att.isImageFallback = true;
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
                aria-label={getAttachmentLabel(att.url, att.name)}
                title={getAttachmentLabel(att.url, att.name)}
                onmousedown={(e: Event) => e.stopPropagation()}
                onpointerdown={(e: Event) => e.stopPropagation()}
                onmouseup={(e: Event) => e.stopPropagation()}
                onclick={(e: Event) => e.stopPropagation()}
            >

                {#if isImage(att)}
                    <img src={att.url} class="attachment-preview" alt="" onerror={() => handleImageError(att)} />
                {:else}
                    <div class="attachment-file-chip">
                        <svg viewBox="0 0 24 24" class="file-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                        <span class="file-name">{getAttachmentLabel(att.url, att.name)}</span>
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

.attachment-file-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    background: var(--bg-secondary, #f9fafb);
    color: var(--text-primary, #374151);
    font-size: 13px;
    height: 40px;
    box-sizing: border-box;
    max-width: 200px;
}
.file-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--text-secondary, #6b7280);
}
.file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
}
:global(.dark) .attachment-file-chip {
    background: var(--bg-secondary, #1f2937);
    border-color: rgba(255, 255, 255, 0.1);
    color: var(--text-primary, #e5e7eb);
}
:global(.dark) .file-icon {
    color: var(--text-secondary, #9ca3af);
}
</style>

