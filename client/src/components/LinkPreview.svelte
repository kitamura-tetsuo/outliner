<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { getLogger } from "$lib/logger";
import { store } from "../stores/store.svelte";
import type { Item } from "../schema/app-schema";

const logger = getLogger("LinkPreview");

interface Props {
    pageName: string | undefined;
    projectName?: string | undefined;
}

let { pageName = "", projectName }: Props = $props();

// プレビュー表示用の状態
let isVisible = $state(false);
let previewContent = $state<Item | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);
let previewPosition = $state({ top: 0, left: 0 });
let previewElement = $state<HTMLElement | null>(null);

// プレビューを表示する
function showPreview(event: MouseEvent) {
    isVisible = true;
    updatePosition(event);
    loadPreviewContent();
}

// プレビューを非表示にする
function hidePreview() {
    isVisible = false;
    previewContent = null;
    error = null;
}

// プレビューの位置を更新する
function updatePosition(event: MouseEvent) {
    if (!previewElement) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // プレビューの幅と高さを取得（まだレンダリングされていない場合はデフォルト値を使用）
    const previewWidth = previewElement.offsetWidth || 300;
    const previewHeight = previewElement.offsetHeight || 200;

    // 初期位置（リンクの下）
    let top = rect.bottom + window.scrollY + 10;
    let left = rect.left + window.scrollX;

    // 画面の右端を超える場合は左に調整
    if (left + previewWidth > viewportWidth) {
        left = viewportWidth - previewWidth - 20;
    }

    // 画面の下端を超える場合は上に表示
    if (top + previewHeight > viewportHeight + window.scrollY) {
        top = rect.top + window.scrollY - previewHeight - 10;
    }

    previewPosition = { top, left };
}

// プレビュー用のページ内容を読み込む
async function loadPreviewContent() {
    if (!store.pages) return;

    isLoading = true;
    error = null;
    previewContent = null;

    try {
        // プロジェクト内リンクの場合
        if (projectName) {
            // 現在のプロジェクトと異なる場合は、プレビューを表示しない
            // 注: 将来的には他プロジェクトのデータも取得できるように拡張する
            if (projectName !== store.project?.title) {
                error = "別プロジェクトのページはプレビューできません";
                isLoading = false;
                return;
            }
        }

        // ページを検索
        const foundPage = findPageByName(pageName);
        if (foundPage) {
            previewContent = foundPage;
        } else {
            error = "ページが見つかりません";
        }
    } catch (err) {
        logger.error("Failed to load preview content:", err);
        error = "プレビューの読み込みに失敗しました";
    } finally {
        isLoading = false;
    }
}

// ページ名からページを検索する
function findPageByName(name: string): Item | null {
    if (!store.pages) return null;

    // ページ名が一致するページを検索
    for (const page of store.pages.current) {
        if (page.text.toLowerCase() === name.toLowerCase()) {
            return page;
        }
    }

    return null;
}

// ページが存在するかどうかを確認する
export function pageExists(name: string, project?: string): boolean {
    // プロジェクト指定がある場合は、現在のプロジェクトと一致するか確認
    if (project && store.project?.title !== project) {
        return false;
    }

    return findPageByName(name) !== null;
}

onMount(() => {
    // マウント時の処理
});

onDestroy(() => {
    // クリーンアップ処理
});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="link-preview-trigger"
    role="tooltip"
    onmouseenter={showPreview}
    onmouseleave={hidePreview}
>

    {#if isVisible}
        <div
            bind:this={previewElement}
            class="link-preview-popup"
            style="top: {previewPosition.top}px; left: {previewPosition.left}px;"
        >
            {#if isLoading}
                <div class="preview-loading">
                    <div class="loader"></div>
                    <p>読み込み中...</p>
                </div>
            {:else if error}
                <div class="preview-error">
                    <p>{error}</p>
                </div>
            {:else if previewContent}
                <div class="preview-content">
                    <h3 class="preview-title">{previewContent.text}</h3>
                    <div class="preview-items">
                        {#if previewContent && previewContent.items && (previewContent.items as any).length > 0}
                            <ul>
                                {#each Array.from({ length: Math.min(5, (previewContent.items as any).length) }, (_, i) => (previewContent.items as any)[i]) as item}
                                    <li>{item.text}</li>
                                {/each}

                                {#if (previewContent.items as any).length > 5}
                                    <li class="more-items">...</li>
                                {/if}
                            </ul>
                        {:else}
                            <p class="empty-page">このページには内容がありません</p>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="preview-not-found">
                    <p>ページが見つかりません</p>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
.link-preview-trigger {
    position: relative;
    display: inline-block;
}

.link-preview-popup {
    position: absolute;
    z-index: 1000;
    width: 300px;
    max-height: 300px;
    background-color: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 12px;
    overflow: hidden;
    font-size: 14px;
}

.preview-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #eee;
    color: #333;
}

.preview-items {
    max-height: 220px;
    overflow-y: auto;
}

.preview-items ul {
    margin: 0;
    padding: 0 0 0 20px;
}

.preview-items li {
    margin-bottom: 4px;
    color: #555;
    line-height: 1.4;
}

.more-items {
    color: #888;
    font-style: italic;
}

.empty-page {
    color: #888;
    font-style: italic;
    margin: 10px 0;
}

.preview-loading, .preview-error, .preview-not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100px;
    color: #666;
}

.preview-error, .preview-not-found {
    color: #d32f2f;
}

.loader {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #3498db;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>
