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
<<<<<<< HEAD
=======
let isComposing = false; // eslint-disable-line @typescript-eslint/no-unused-vars
>>>>>>> origin/main
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

// Note: Removed reactive effect on activeItemId to avoid potential
// update-depth loops during E2E when alias picker and focus logic interact.
// Focus management is handled in onMount and OutlinerItem.startEditing().

// global textarea をストアに登録
onMount(() => {
    // Initialize measurement canvas on client only
    // Node.jsテスト環境ではCanvas APIがサポートされていない可能性があるため、
    // 存在チェックをしてから初期化する
    if (typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined') {
        try {
            measureCanvas = document.createElement("canvas");
            // テスト環境ではgetContextが実装されていない場合があるため、try-catchで対応
            measureCtx = measureCanvas.getContext("2d");
            if (!measureCtx) {
                console.warn('GlobalTextArea: Canvas 2D context not available, text measurement may be affected');
            }
        } catch (error) {
            // テスト環境や特定のブラウザではCanvas APIが利用できない場合がある
            console.warn('GlobalTextArea: Canvas API not available, text measurement may be affected:', error);
            measureCtx = null;
        }
    } else {
        console.warn('GlobalTextArea: Canvas API not available in this environment, text measurement may be affected');
    }

    store.setTextareaRef(textareaRef);
    // generalStore にも参照を保持（コマンドパレットのフォールバックで利用）
    try { (generalStore as any).textareaRef = textareaRef; } catch {}
    console.log("GlobalTextArea: Textarea reference set in store");

    // KeyEventHandler をグローバルに公開（テスト用）
    if (typeof window !== "undefined") {
        (window as any).KeyEventHandler = KeyEventHandler;
    }

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
        (window as any).generalStore = generalStore;
    }

    // エイリアスピッカー可視時のキーを常にピッカーへフォワード（フォーカスに依存しない）
    try {
        const forward = (ev: KeyboardEvent) => {
            if (!aliasPickerStore.isVisible) return;
            const k = ev.key;
            if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Enter" && k !== "Escape") return;
            const picker = document.querySelector(".alias-picker") as HTMLElement | null;
            if (!picker) return;
            // すでにエイリアスピッカー配下で発生したイベントは二重転送しない
            const t = ev.target as Node | null;
            if (t && picker.contains(t)) return;
            try { console.log("GlobalTextArea: forward key to alias-picker:", k); } catch {}
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
    // フォールバック: テキストエリアにフォーカスがない場合でも入力を反映
    try {
        const typingFallback = (ev: KeyboardEvent) => {
            try { console.log("typingFallback fired:", ev.key, "active=", !!store.getActiveItem()); } catch {}
            // IME 合成中や修飾キー付きは無視（ただし Alt+Shift+Arrow は矩形選択のため許可）
            const isBoxSelectionKey = ev.altKey && ev.shiftKey &&
                (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight");
            if (ev.isComposing || (!isBoxSelectionKey && (ev.ctrlKey || ev.metaKey || ev.altKey))) return;
            // エイリアスピッカー/コマンドパレット表示中は既存のフォワーダーに任せる
            if (aliasPickerStore.isVisible || (window as any).commandPaletteStore?.isVisible) return;

            const activeId = store.getActiveItem();
            const ta = textareaRef;
            // 既にtextareaがフォーカスされているなら通常の処理に任せる
            if (document.activeElement === ta) return;
            if (!activeId) return;

            // 単一文字の入力
            const k = ev.key;
            if (k.length === 1) {
                const cursors = store.getCursorInstances();
                try { console.log("typingFallback chars:", k, "cursors=", cursors.length); } catch {}
                if (cursors.length > 0 && ta) {
                    ev.preventDefault();
                    // まず直接モデルを更新（信頼性重視）
                    try { cursors.forEach(c => c.insertText(k)); } catch {}

                    // 併せてテキストエリアに実入力として反映し、InputEventを発火（通常フロー維持）
                    const prev = ta.value ?? "";
                    const selStart = typeof ta.selectionStart === "number" ? ta.selectionStart : prev.length;
                    const selEnd = typeof ta.selectionEnd === "number" ? ta.selectionEnd : selStart;
                    ta.value = prev.slice(0, selStart) + k + prev.slice(selEnd);
                    // キャレットを1文字進める
                    try { ta.selectionStart = ta.selectionEnd = selStart + 1; } catch {}
                    const ie = new InputEvent("input", { data: k, inputType: "insertText", bubbles: true, cancelable: true, composed: true });
                    ta.dispatchEvent(ie);
                    // フォーカス外でも確実にモデル更新させる
                    try { KeyEventHandler.handleInput(ie as unknown as Event); } catch {}
                    store.startCursorBlink();
                }
                return;
            }

            // Enter / Backspace / Delete の簡易フォールバック
            const cursors = store.getCursorInstances();
            if (cursors.length === 0) return;
            if (k === "Enter") {
                ev.preventDefault();
                cursors.forEach(c => c.insertLineBreak());
                return;
            }
            if (k === "Backspace") {
                ev.preventDefault();
                cursors.forEach(c => c.deleteBackward());
                return;
            }
            if (k === "Delete") {
                ev.preventDefault();
                cursors.forEach(c => c.deleteForward());
                return;
            }
        };
        window.addEventListener("keydown", typingFallback, { capture: true });
        (window as any).__TYPING_FWD__ = typingFallback;
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
            if (k === "Enter") {
                try {
                    // フィルタ結果が単一で Alias の場合は直接 insert してから閉じる（確実にピッカーを出す）
                    const list = cps.filtered ?? [];
                    const sel = list?.[cps.selectedIndex ?? 0];
                    const q = String(cps.query || (cps.deriveQueryFromDoc?.() || "")).toLowerCase();
                    const isAliasOnly = Array.isArray(list) && list.length === 1 && (list[0]?.type === "alias");
                    const looksAlias = q === "alias" || /^(?:al|ali|alia|alias)$/.test(q);

                    // 直接 textarea の値からも厳密に検出
                    let textSaysAlias = false;
                    try {
                        const ta: HTMLTextAreaElement | null | undefined = (window as any).generalStore?.textareaRef;
                        if (ta && typeof ta.value === "string") {
                            const before = ta.value.slice(0, typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length);
                            textSaysAlias = /\/(?:al|ali|alia|alias)$/i.test(before);
                        }
                    } catch {}

                    if (isAliasOnly || looksAlias || textSaysAlias) {
                        try { console.log("GlobalTextArea: palette Enter forcing alias insert (q=", q, ", textSaysAlias=", textSaysAlias, ")"); } catch {}
                        cps.insert("alias");
                        cps.hide();
                        ev.preventDefault();
                        return;
                    }
                    // それ以外は通常の確定
                    if (sel) {
                        try { console.log("GlobalTextArea: palette Enter confirming sel=", sel?.type); } catch {}
                        cps.confirm();
                        ev.preventDefault();
                        return;
                    }
                } catch {}
                // フォールバック
                cps.confirm();
                ev.preventDefault();
                return;
            }
            if (k === "ArrowDown") { cps.move(1); ev.preventDefault(); return; }
            if (k === "ArrowUp") { cps.move(-1); ev.preventDefault(); return; }
        };
        window.addEventListener("keydown", paletteTypeForwarder, { capture: true });
        (window as any).__PALETTE_FWD__ = paletteTypeForwarder;
    } catch {}

    // グローバル: フォーカス位置に関わらず KeyEventHandler を呼ぶバックアップ
    try {
        const globalKeyForwarder = (ev: KeyboardEvent) => {
            // 既に他で処理済みは尊重
            if (ev.defaultPrevented) return;
            // IME/修飾キーは無視（ただし Alt+Shift+Arrow は矩形選択のため許可）
            const isBoxSelectionKey = ev.altKey && ev.shiftKey &&
                (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight");
            if (ev.isComposing || (!isBoxSelectionKey && (ev.ctrlKey || ev.metaKey || ev.altKey))) return;
            // 常に KeyEventHandler へ委譲（内部で必要時のみ処理される）
            KeyEventHandler.handleKeyDown(ev);
        };
        window.addEventListener("keydown", globalKeyForwarder);
        (window as any).__GLOBAL_KEY_FWD__ = globalKeyForwarder;
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
    if (!textareaRef || !measureCtx) {
        // フォールバック：measureCtxが利用できない場合は固定幅を設定
        if (textareaRef) {
            textareaRef.style.width = `${(text.length * 10) + 4}px`; // テキスト長に応じた適当な幅
        }
        return;
    }
    const style = getComputedStyle(textareaRef);
    measureCtx.font = `${style.fontSize} ${style.fontFamily}`;
    const metrics = measureCtx.measureText(text);
    textareaRef.style.width = `${metrics.width + 4}px`;
}

function handleCompositionStart(event: CompositionEvent) {
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

    // Fallback for headless/E2E environments where input event may not fire
    try {
        const isPrintable = typeof event.key === "string" && event.key.length === 1;
        const isModifier = event.ctrlKey || event.metaKey || event.altKey || event.isComposing;
        const isTest = typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true";
        const isTextareaFocused = document.activeElement === textareaRef;
        if (isTest && isPrintable && !isModifier && !aliasPickerStore.isVisible && !isTextareaFocused) {
            const cursors = store.getCursorInstances();
            if (cursors.length > 0) {
                console.log("GlobalTextArea.handleKeyDown fallback insert:", event.key, "cursors=", cursors.length);
                cursors.forEach(c => c.insertText(event.key));
                store.startCursorBlink();
            }
        }
    } catch {}
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

// カットイベントを KeyEventHandler へ委譲
function handleCut(event: ClipboardEvent) {
    KeyEventHandler.handleCut(event);
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
<<<<<<< HEAD
function handleBlur() {
=======
function handleBlur(_event: FocusEvent) { // eslint-disable-line @typescript-eslint/no-unused-vars
>>>>>>> origin/main
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
    oncut={handleCut}
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
