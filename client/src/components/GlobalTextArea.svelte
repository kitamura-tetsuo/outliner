<script lang="ts">
import { Tree } from "fluid-framework";
import {
    onDestroy,
    onMount,
} from "svelte";
import { KeyEventHandler } from "../lib/KeyEventHandler";
import { Items } from "@common/schema/app-schema";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";

let textareaRef: HTMLTextAreaElement;
let isComposing = false;
const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

// store.activeItemId 変化時に再フォーカス
$effect(() => {
    const id = store.activeItemId;
    console.log(`GlobalTextArea: activeItemId changed to ${id}`);
    if (id && textareaRef) {
        console.log(`GlobalTextArea: Setting focus for activeItemId ${id}`);

        // フォーカスを確実に設定するための複数の試行
        if (textareaRef) {
            textareaRef.focus();
            console.log(`GlobalTextArea: Initial focus call, activeElement: ${document.activeElement?.tagName}`);

            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                if (textareaRef) {
                    textareaRef.focus();
                    console.log(`GlobalTextArea: RAF focus call, activeElement: ${document.activeElement?.tagName}`);

                    // さらに確実にするためにsetTimeoutも併用
                    setTimeout(() => {
                        if (textareaRef) {
                            textareaRef.focus();
                            const isFocused = document.activeElement === textareaRef;
                            console.log(`GlobalTextArea: Final focus call, focused: ${isFocused}`);

                            // デバッグ情報
                            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                console.log(
                                    `GlobalTextArea: focus set on activeItemId change. Active element is textarea: ${isFocused}`,
                                );
                            }
                        }
                    }, 10);
                }
            });
        }
    }
});

// global textarea をストアに登録
onMount(() => {
    store.setTextareaRef(textareaRef);
    console.log("GlobalTextArea: Textarea reference set in store");

    // 初期フォーカスを設定
    if (textareaRef) {
        textareaRef.focus();
        console.log("GlobalTextArea: Initial focus set on mount, activeElement:", document.activeElement?.tagName);

        // フォーカス確保のための追加試行
        requestAnimationFrame(() => {
            if (textareaRef) {
                textareaRef.focus();
                console.log("GlobalTextArea: RAF focus set, activeElement:", document.activeElement?.tagName);

                setTimeout(() => {
                    if (textareaRef) {
                        textareaRef.focus();
                        const isFocused = document.activeElement === textareaRef;
                        console.log("GlobalTextArea: Final focus set, focused:", isFocused);
                    }
                }, 10);
            }
        });
    }

    // テスト用にKeyEventHandlerをグローバルに公開
    if (typeof window !== "undefined") {
        (window as any).__KEY_EVENT_HANDLER__ = KeyEventHandler;
        (window as any).Tree = Tree;
        (window as any).Items = Items;
        (window as any).generalStore = generalStore;
    }
});

onDestroy(() => {
    store.setTextareaRef(null);
});

function updateCompositionWidth(text: string) {
    if (!textareaRef || !measureCtx) return;
    const style = getComputedStyle(textareaRef);
    measureCtx.font = `${style.fontSize} ${style.fontFamily}`;
    const metrics = measureCtx.measureText(text);
    textareaRef.style.width = `${metrics.width + 4}px`;
}

function handleCompositionStart(event: CompositionEvent) {
    isComposing = true;
    store.setIsComposing(true);
    textareaRef.classList.add("ime-input");
    textareaRef.style.opacity = "1";
    updateCompositionWidth(event.data || "");
    KeyEventHandler.handleCompositionStart(event);
}

// キーダウンイベントを KeyEventHandler へ委譲
function handleKeyDown(event: KeyboardEvent) {
    console.log("GlobalTextArea.handleKeyDown called with key:", event.key);
    console.log("GlobalTextArea.handleKeyDown: event.target:", event.target);
    console.log("GlobalTextArea.handleKeyDown: textareaRef:", textareaRef);
    console.log("GlobalTextArea.handleKeyDown: activeElement:", document.activeElement);
    KeyEventHandler.handleKeyDown(event);
}

// 入力イベントを KeyEventHandler へ委譲
function handleInput(event: Event) {
    console.log("GlobalTextArea.handleInput called with event:", event);
    console.log("GlobalTextArea.handleInput: event.target:", event.target);
    console.log("GlobalTextArea.handleInput: textareaRef:", textareaRef);
    console.log("GlobalTextArea.handleInput: activeElement:", document.activeElement);
    KeyEventHandler.handleInput(event);
}

// CompositionEnd イベントを KeyEventHandler へ委譲
function handleCompositionEnd(event: CompositionEvent) {
    KeyEventHandler.handleCompositionEnd(event);
    isComposing = false;
    store.setIsComposing(false);
    textareaRef.classList.remove("ime-input");
    textareaRef.style.opacity = "0";
    textareaRef.style.width = "1px";
}

// CompositionUpdate イベントを KeyEventHandler へ委譲
function handleCompositionUpdate(event: CompositionEvent) {
    updateCompositionWidth(event.data || "");
    KeyEventHandler.handleCompositionUpdate(event);
}

// コピーイベントを KeyEventHandler へ委譲
function handleCopy(event: ClipboardEvent) {
    KeyEventHandler.handleCopy(event);
}

/**
 * ペーストイベントを KeyEventHandler に委譲する非同期ハンドラ。
 * `KeyEventHandler.handlePaste` は Promise を返すため `await` して
 * 権限拒否や読み取り失敗を捕捉し、`clipboard-permission-denied`
 * または `clipboard-read-error` を dispatch してユーザーにはペーストされない。
 */
async function handlePaste(event: ClipboardEvent) {
    await KeyEventHandler.handlePaste(event);
}

// フォーカス喪失時の処理を追加
function handleBlur(_event: FocusEvent) {
    const activeItemId = store.getActiveItem();
    if (activeItemId) {
        // フォーカスを確実に設定するための複数の試行
        setTimeout(() => {
            if (textareaRef) {
                textareaRef.focus();

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `GlobalTextArea: focus restored after blur. Active element is textarea: ${
                            document.activeElement === textareaRef
                        }`,
                    );
                }
            }
        }, 10);
    }
}
</script>

<textarea
    bind:this={textareaRef}
    class="global-textarea"
    on:keydown={handleKeyDown}
    on:input={handleInput}
    on:compositionstart={handleCompositionStart}
    on:compositionupdate={handleCompositionUpdate}
    on:compositionend={handleCompositionEnd}
    on:copy={handleCopy}
    on:paste={async event => {
        try {
            await handlePaste(event);
        } catch (error) {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("clipboard-read-error"));
            }
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error("GlobalTextArea.handlePaste failed", error);
            }
        }
    }}
    on:blur={handleBlur}
></textarea>

<style>
.global-textarea {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
}
.ime-input {
    z-index: 10;
    color: transparent;
    background-color: transparent;
}
</style>
