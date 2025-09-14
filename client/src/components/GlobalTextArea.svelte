<script lang="ts">
import {
    onDestroy,
    onMount,
} from "svelte";
import { KeyEventHandler } from "../lib/KeyEventHandler";
import { Items } from "../schema/app-schema";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";

let textareaRef: HTMLTextAreaElement;
let isComposing = false;
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

// 再入防止と無限ループ防止用のフラグ/直近ID
let __focusSyncing = false;
let __lastFocusedItemId: string | number | null = null;

// Note: Removed reactive effect on activeItemId to avoid potential
// update-depth loops during E2E when alias picker and focus logic interact.
// Focus management is handled in onMount and OutlinerItem.startEditing().

// global textarea をストアに登録
onMount(() => {
    // Initialize measurement canvas on client only
    try {
        measureCanvas = document.createElement("canvas");
        measureCtx = measureCanvas.getContext("2d");
    } catch {}

    store.setTextareaRef(textareaRef);
    // generalStore にも参照を保持（コマンドパレットのフォールバックで利用）
    try { (generalStore as any).textareaRef = textareaRef; } catch {}
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
        (window as any).Items = Items;
        (window as any).generalStore = generalStore;
    }

    // エイリアスピッカー可視時のキーを常にピッカーへフォワード（フォーカスに依存しない）
    try {
        const forward = (ev: KeyboardEvent) => {
            if (!aliasPickerStore.isVisible) return;
            const k = ev.key;
            if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Enter" && k !== "Escape") return;
            try { console.log("GlobalTextArea: forward key to alias-picker:", k); } catch {}
            const picker = document.querySelector(".alias-picker") as HTMLElement | null;
            if (!picker) return;
            const forwarded = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
            picker.dispatchEvent(forwarded);
            ev.preventDefault();
        };
        window.addEventListener("keydown", forward, { capture: true });
        // onDestroyで解除
        (window as any).__ALIAS_FWD__ = forward;
    } catch {}

    // フォールバック: スラッシュ押下で常にパレットを表示（内部リンク直後はKeyEventHandler側で抑止）
    try {
        const slashListener = (ev: KeyboardEvent) => {
            if (ev.key !== "/") return;
            // 既に表示中なら何もしない
            if ((window as any).commandPaletteStore?.isVisible) return;
            try {
                const pos = commandPaletteStore.getCursorScreenPosition();
                commandPaletteStore.show(pos || { top: 0, left: 0 });
            } catch {}
        };
        window.addEventListener("keydown", slashListener, { capture: true });
        (window as any).__SLASH_FWD__ = slashListener;
    } catch {}

    // 直近のキー入力を常に記録（/ch のような連続入力を検出するため）
    try {
        const recordKeys = (ev: KeyboardEvent) => {
            if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
            const k = ev.key;
            if (typeof k === "string" && k.length === 1) {
                const w: any = (window as any);
                w.__KEYSTREAM__ = (w.__KEYSTREAM__ || "") + k;
                if (w.__KEYSTREAM__.length > 256) {
                    w.__KEYSTREAM__ = w.__KEYSTREAM__.slice(-256);
                }
            }
        };
        window.addEventListener("keydown", recordKeys, { capture: true });
        (window as any).__KEYSTREAM_FWD__ = recordKeys;
    } catch {}

    // フォールバック: パレット表示中はグローバルkeydownから直接文字入力/移動/確定を転送
    try {
        const paletteTypeForwarder = (ev: KeyboardEvent) => {
            const cps: any = (window as any).commandPaletteStore ?? commandPaletteStore;
            if (!cps?.isVisible) return;
            const k = ev.key;
            if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && k.length === 1 && k !== "/") {
                // 軽量入力でUIだけを即時更新（モデルは変更しない）
                cps.inputLight(k);
                ev.preventDefault();
                return;
            }
            if (k === "Backspace") { cps.backspaceLight(); ev.preventDefault(); return; }
            if (k === "Enter") { cps.confirm(); ev.preventDefault(); return; }
            if (k === "ArrowDown") { cps.move(1); ev.preventDefault(); return; }
            if (k === "ArrowUp") { cps.move(-1); ev.preventDefault(); return; }
        };
        window.addEventListener("keydown", paletteTypeForwarder, { capture: true });
        (window as any).__PALETTE_FWD__ = paletteTypeForwarder;
    } catch {}
});

onDestroy(() => {
    store.setTextareaRef(null);
    try { (generalStore as any).textareaRef = null; } catch {}
    try {
        const f = (window as any).__ALIAS_FWD__ as any;
        if (f) window.removeEventListener("keydown", f, { capture: true } as any);
    } catch {}
    try {
        const s = (window as any).__SLASH_FWD__ as any;
        if (s) window.removeEventListener("keydown", s, { capture: true } as any);
    } catch {}
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
    // エイリアスピッカー表示中はフォーカス復元しない
    if (aliasPickerStore.isVisible) {
        return;
    }
    if (activeItemId) {
        // フォーカスを確実に設定するための複数の試行
        setTimeout(() => {
            if (textareaRef && !aliasPickerStore.isVisible) {
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
    onkeydown={handleKeyDown}
    oninput={handleInput}
    oncompositionstart={handleCompositionStart}
    oncompositionupdate={handleCompositionUpdate}
    oncompositionend={handleCompositionEnd}
    oncopy={handleCopy}
    onpaste={async event => {
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
    onblur={handleBlur}
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
:global(.ime-input) {
    z-index: 10;
    color: transparent;
    background-color: transparent;
}
</style>
