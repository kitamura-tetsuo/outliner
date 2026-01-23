<script lang="ts">
import { onMount, onDestroy } from "svelte";
import type { Item } from "../schema/app-schema";
import { getLogger } from "../lib/logger";

const logger = getLogger("OutlinerItemAttachments");

const IS_TEST: boolean = (import.meta.env.MODE === 'test') || ((typeof window !== 'undefined') && ((window as any).__E2E__ === true));

interface Props {
    modelId: string;
    item: Item;
}

let { modelId, item }: Props = $props();

// 添付ミラー（Yjs→UI）
let attachmentsMirror = $state<string[]>([]);

// Yjs observe による添付の購読
onMount(() => {
    try {
        const yArr: any = (item as any)?.attachments;
        const read = () => {
            try {
                const arr: any[] = (yArr?.toArray?.() ?? []);
                attachmentsMirror = arr.map((u: any) => Array.isArray(u) ? u[0] : u);
                logger.debug('[OutlinerItemAttachments][Yjs] attachments observe ->', attachmentsMirror.length, 'id=', modelId);
            } catch {}
        };
        if (yArr && typeof yArr.observe === 'function' && typeof yArr.unobserve === 'function') {
            read(); // 初期反映
            const yHandler = () => { read(); };
            yArr.observe(yHandler);
            onDestroy(() => { try { yArr.unobserve(yHandler); } catch {} });
        } else {
            // 予備: observe不可でも一度だけ反映
            attachmentsMirror = ((item as any)?.attachments?.toArray?.() ?? []).map((u: any) => Array.isArray(u) ? u[0] : u);
        }
    } catch {}
});

// テスト環境用のイベントリスナー
onMount(() => {
    const onAtt = (_e: any) => {
        try {
            const eid = String((_e && (_e as any).detail && (_e as any).detail.id) ?? '');
            logger.debug('[OutlinerItemAttachments][TEST] item-attachments-changed received eid=', eid, 'selfId=', modelId);
            if (eid && String(modelId) !== eid) return;
            const yArr: any = (item as any)?.attachments;
            const arr: any[] = (yArr?.toArray?.() ?? []);
            if (arr.length > 0) {
                attachmentsMirror = arr.map((u: any) => Array.isArray(u) ? u[0] : u);
            }
            logger.debug('[OutlinerItemAttachments][TEST] mirror updated ->', attachmentsMirror.length, 'id=', modelId);
        } catch {}
    };
    try {
        if (IS_TEST) window.addEventListener('item-attachments-changed', onAtt as any, { passive: true } as any);
    } catch {}
    onDestroy(() => { try { window.removeEventListener('item-attachments-changed', onAtt as any); } catch {} });
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

