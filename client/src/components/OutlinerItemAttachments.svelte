<script lang="ts">
import { safeDecodeURIComponent } from "../utils/urlUtils";


import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";
import { getLogger } from "../lib/logger";


interface ObservableArray { toArray?: () => unknown[], observe?: (obs: () => void) => void, unobserve?: (obs: () => void) => void }
interface ObservableMap { observe?: (obs: (event: MapEvent) => void) => void, unobserve?: (obs: (event: MapEvent) => void) => void }
interface MapEvent { changes?: { keys?: Map<string, unknown> } }
interface HasObservableAttachments { attachments?: ObservableArray, yMap?: ObservableMap }

const logger = getLogger("OutlinerItemAttachments");

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

// Subscribe to attachments via Yjs observe (mirror pattern: Yjs -> $state).
// The array observer is (re)bound through the item's Y.Map, because
// `Item.attachments` only returns the live array once the "attachments" key
// exists on the map: an item that has never had an attachment hands out a
// detached placeholder, and a remote client may replace the array wholesale.
// Watching the map keeps the mirror bound to whichever array is current.
onMount(() => {
    let observedArray: ObservableArray | undefined;

    const read = () => {
        try {
            const arr = (observedArray?.toArray?.() ?? []);
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

    const onArrayChange = () => { read(); };

    const detachArray = () => {
        try { observedArray?.unobserve?.(onArrayChange); } catch (_e) { /* ignore */ }
        observedArray = undefined;
    };

    // Bind to the current attachments array (creating no Yjs state) and mirror it.
    const bindArray = () => {
        try {
            const next = (item as unknown as HasObservableAttachments)?.attachments;
            if (next === observedArray) { read(); return; }
            detachArray();
            observedArray = next;
            try { observedArray?.observe?.(onArrayChange); } catch (_e) { /* ignore */ }
            read();
        } catch (_e) { /* ignore */ }
    };

    const onMapChange = (event: MapEvent) => {
        try {
            if (event?.changes?.keys?.has?.('attachments')) bindArray();
        } catch (_e) { /* ignore */ }
    };

    bindArray();

    const yMap = (item as unknown as HasObservableAttachments)?.yMap;
    try { yMap?.observe?.(onMapChange); } catch (_e) { /* ignore */ }

    return () => {
        detachArray();
        try { yMap?.unobserve?.(onMapChange); } catch (_e) { /* ignore */ }
    };
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

// Base for relative attachment URLs. Resolved lazily and defensively so the
// extension check below still works where `window.location` is absent (SSR,
// component tests), instead of silently reporting "not an image".
function urlBase(): string | undefined {
    try {
        return globalThis.location?.origin;
    } catch { /* ignore */ }
    return undefined;
}

function hasImageExtension(url: string): boolean {
    try {
        const urlObj = new URL(url, urlBase());
        const pathname = urlObj.pathname.toLowerCase();
        return /\.(jpeg|jpg|gif|png|webp|svg|avif)$/.test(pathname);
    } catch { /* ignore */ }
    return false;
}

/**
 * True when the attachment states its own type: an explicit mime type or a
 * known image extension. Such an attachment keeps that type regardless of
 * whether the resource can currently be fetched.
 */
function hasDeclaredType(att: AttachmentData): boolean {
    return !!att.mime || hasImageExtension(att.url);
}

function isImage(att: AttachmentData): boolean {
    // A declared type wins: a failed load means the resource is unreachable
    // (offline, expired signed URL, blocked host), not that a .png stopped
    // being an image, so `isImageFallback` must not override it.
    if (att.mime) return att.mime.startsWith("image/");
    if (hasImageExtension(att.url)) return true;
    // Type unknown (legacy URLs with no mime and no extension): render
    // optimistically as an image and retract that guess if the load fails.
    return !att.isImageFallback;
}

function handleImageError(att: AttachmentData) {
    // Only the optimistic guess above is retractable. Attachments that declare
    // an image type stay images and show the browser's broken-image preview,
    // which keeps rendering independent of network availability.
    if (hasDeclaredType(att)) return;
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

