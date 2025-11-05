<script lang="ts">
import { onMount, onDestroy } from "svelte";
import type { Item } from "../schema/app-schema";
import { getLogger } from "../lib/logger";

const logger = getLogger("OutlinerItemAttachments");

const IS_TEST: boolean = (import.meta.env.MODE === 'test') || ((typeof window !== 'undefined') && (window.__E2E__ === true));

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
        const yArr: unknown = (item as unknown)?.attachments;
        const read = () => {
            try {
                const arr: unknown[] = (yArr?.toArray?.() ?? []);
                attachmentsMirror = arr.map((u: unknown) => Array.isArray(u) ? u[0] : u);
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
            attachmentsMirror = ((item as unknown)?.attachments?.toArray?.() ?? []).map((u: unknown) => Array.isArray(u) ? u[0] : u);
        }
    } catch {}
});

// テスト環境用のイベントリスナー
onMount(() => {
    const onAtt = (_e: unknown) => {
        try {
            const eid = String((_e && (_e as unknown).detail && (_e as unknown).detail.id) ?? '');
            logger.debug('[OutlinerItemAttachments][TEST] item-attachments-changed received eid=', eid, 'selfId=', modelId);
            if (eid && String(modelId) !== eid) return;
            const yArr: unknown = (item as unknown)?.attachments;
            const arr: unknown[] = (yArr?.toArray?.() ?? []);
            if (arr.length > 0) {
                attachmentsMirror = arr.map((u: unknown) => Array.isArray(u) ? u[0] : u);
            }
            logger.debug('[OutlinerItemAttachments][TEST] mirror updated ->', attachmentsMirror.length, 'id=', modelId);
        } catch {}
    };
    try {
        if (IS_TEST) window.addEventListener('item-attachments-changed', onAtt as unknown, { passive: true } as unknown);
    } catch {}
    onDestroy(() => { try { window.removeEventListener('item-attachments-changed', onAtt as unknown); } catch {} });
});

const attachments = $derived.by(() => {
    try {
        return attachmentsMirror as string[];
    } catch {
        return [] as string[];
    }
});
</script>

{#if attachments.length > 0}
    <div class="attachments">
        {#each attachments as url (url)}
            <img src={url} class="attachment-preview" alt="添付ファイル" />
        {/each}
    </div>
{/if}

<style>
.attachments {
    margin-top: 4px;
    display: flex;
    gap: 4px;
}

.attachment-preview {
    width: 40px;
    height: 40px;
    object-fit: cover;
}
</style>

