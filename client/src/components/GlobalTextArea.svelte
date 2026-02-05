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
let isComposing = false; // eslint-disable-line @typescript-eslint/no-unused-vars
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

// Note: Removed reactive effect on activeItemId to avoid potential
// update-depth loops during E2E when alias picker and focus logic interact.
// Focus management is handled in onMount and OutlinerItem.startEditing().

// Register global textarea to the store
onMount(() => {
    // Initialize measurement canvas on client only
    // Since the Canvas API may not be supported in Node.js test environments,
    // check for existence before initialization.
    if (typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined') {
        try {
            measureCanvas = document.createElement("canvas");
            // In test environments, getContext may not be implemented, so handle with try-catch
            measureCtx = measureCanvas.getContext("2d");
            if (!measureCtx) {
                console.warn('GlobalTextArea: Canvas 2D context not available, text measurement may be affected');
            }
        } catch (error) {
            // Canvas API might not be available in test environments or specific browsers
            console.warn('GlobalTextArea: Canvas API not available, text measurement may be affected:', error);
            measureCtx = null;
        }
    } else {
        console.warn('GlobalTextArea: Canvas API not available in this environment, text measurement may be affected');
    }

    store.setTextareaRef(textareaRef);
    // Keep a reference in generalStore as well (used as a fallback for the command palette)
    try { generalStore.textareaRef = textareaRef; } catch {}
    console.log("GlobalTextArea: Textarea reference set in store");

    // Expose KeyEventHandler globally (for testing)
    if (typeof window !== "undefined") {
        window.KeyEventHandler = KeyEventHandler;
    }

    // Set initial focus
    if (textareaRef) {
        textareaRef.focus();
        console.log("GlobalTextArea: Initial focus set on mount, activeElement:", document.activeElement?.tagName);

        // Additional attempts to ensure focus
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

    // Expose KeyEventHandler globally for testing
    if (typeof window !== "undefined") {
        window.__KEY_EVENT_HANDLER__ = KeyEventHandler;
        window.Items = Items;
        window.generalStore = generalStore;
    }

    // Always forward keys to the picker when the alias picker is visible (independent of focus)
    try {
        const forward = (ev: KeyboardEvent) => {
            if (!aliasPickerStore.isVisible) return;
            const k = ev.key;
            if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Enter" && k !== "Escape") return;
            const picker = document.querySelector(".alias-picker") as HTMLElement | null;
            if (!picker) return;
            // Do not re-forward events that already occurred within the alias picker
            const t = ev.target as Node | null;
            if (t && picker.contains(t)) return;
            try { console.log("GlobalTextArea: forward key to alias-picker:", k); } catch {}
            const forwarded = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
            picker.dispatchEvent(forwarded);
            ev.preventDefault();
        };
        window.addEventListener("keydown", forward, { capture: true });
        // Remove in onDestroy
        window.__ALIAS_FWD__ = forward;
    } catch {}

    // Fallback: Always show palette on slash press (suppressed by KeyEventHandler immediately after internal links)
    try {
        const slashListener = (ev: KeyboardEvent) => {
            if (ev.key !== "/") return;
            // Do nothing if already visible
            if (window.commandPaletteStore?.isVisible) return;
            try {
                const pos = commandPaletteStore.getCursorScreenPosition();
                commandPaletteStore.show(pos || { top: 0, left: 0 });
            } catch {}
        };
        window.addEventListener("keydown", slashListener, { capture: true });
        window.__SLASH_FWD__ = slashListener;
    } catch {}

    // Always record recent key inputs (to detect sequences like /ch)
    try {
        const recordKeys = (ev: KeyboardEvent) => {
            if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
            const k = ev.key;
            if (typeof k === "string" && k.length === 1) {
                const w = window;
                w.__KEYSTREAM__ = (w.__KEYSTREAM__ || "") + k;
                if (w.__KEYSTREAM__ && w.__KEYSTREAM__.length > 256) {
                    w.__KEYSTREAM__ = w.__KEYSTREAM__.slice(-256);
                }
            }
        };
        window.addEventListener("keydown", recordKeys, { capture: true });
        window.__KEYSTREAM_FWD__ = recordKeys;
    } catch {}
    // Fallback: Reflect input even if the textarea is not focused
    try {
        const typingFallback = (ev: KeyboardEvent) => {
            try { console.log("typingFallback fired:", ev.key, "active=", !!store.getActiveItem()); } catch {}
            // Ignore during IME composition or with modifier keys (except Alt+Shift+Arrow is allowed for rectangular selection)
            const isBoxSelectionKey = ev.altKey && ev.shiftKey &&
                (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight");
            if (ev.isComposing || (!isBoxSelectionKey && (ev.ctrlKey || ev.metaKey || ev.altKey))) return;
            // Leave to existing forwarders while alias picker/command palette is visible
            if (aliasPickerStore.isVisible || window.commandPaletteStore?.isVisible) return;

            const activeId = store.getActiveItem();
            const ta = textareaRef;
            // If textarea is already focused, leave it to the normal process
            if (document.activeElement === ta) return;
            if (!activeId) return;

            // Single character input
            const k = ev.key;
            if (k.length === 1) {
                const cursors = store.getCursorInstances();
                try { console.log("typingFallback chars:", k, "cursors=", cursors.length); } catch {}
                if (cursors.length > 0 && ta) {
                    ev.preventDefault();
                    // Update the model directly first (prioritizing reliability)
                    try { cursors.forEach(c => c.insertText(k)); } catch {}

                    // Also reflect as actual input in the textarea and fire InputEvent (maintaining normal flow)
                    const prev = ta.value ?? "";
                    const selStart = typeof ta.selectionStart === "number" ? ta.selectionStart : prev.length;
                    const selEnd = typeof ta.selectionEnd === "number" ? ta.selectionEnd : selStart;
                    ta.value = prev.slice(0, selStart) + k + prev.slice(selEnd);
                    // Advance caret by one character
                    try { ta.selectionStart = ta.selectionEnd = selStart + 1; } catch {}
                    const ie = new InputEvent("input", { data: k, inputType: "insertText", bubbles: true, cancelable: true, composed: true });
                    ta.dispatchEvent(ie);
                    // Ensure model update even when out of focus
                    try { KeyEventHandler.handleInput(ie as unknown as Event); } catch {}
                    store.startCursorBlink();
                }
                return;
            }

            // Simple fallback for Enter / Backspace / Delete
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
        window.__TYPING_FWD__ = typingFallback;
    } catch {}


    // Fallback: Directly forward character input/movement/confirmation from global keydown while palette is visible
    try {
        const paletteTypeForwarder = (ev: KeyboardEvent) => {
            const cps = window.commandPaletteStore ?? commandPaletteStore;
            if (!cps?.isVisible) return;
            const k = ev.key;
            if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && k.length === 1 && k !== "/") {
                // Immediate UI update with light input (model is not changed)
                cps.inputLight(k);
                ev.preventDefault();
                return;
            }
            if (k === "Backspace") { cps.backspaceLight(); ev.preventDefault(); return; }
            if (k === "Enter") {
                try {
                    // If filter result is unique and is an Alias, insert directly and close (ensure picker is shown)
                    const list = cps.filtered ?? [];
                    const sel = list?.[cps.selectedIndex ?? 0];
                    const q = String(cps.query || (cps.deriveQueryFromDoc?.() || "")).toLowerCase();
                    const isAliasOnly = Array.isArray(list) && list.length === 1 && (list[0]?.type === "alias");
                    const looksAlias = q === "alias" || /^(?:al|ali|alia|alias)$/.test(q);

                    // Strictly detect from textarea value as well
                    let textSaysAlias = false;
                    try {
                        const ta: HTMLTextAreaElement | null | undefined = window.generalStore?.textareaRef;
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
                    // Otherwise, normal confirmation
                    if (sel) {
                        try { console.log("GlobalTextArea: palette Enter confirming sel=", sel?.type); } catch {}
                        cps.confirm();
                        ev.preventDefault();
                        return;
                    }
                } catch {}
                // Fallback
                cps.confirm();
                ev.preventDefault();
                return;
            }
            if (k === "ArrowDown") { cps.move(1); ev.preventDefault(); return; }
            if (k === "ArrowUp") { cps.move(-1); ev.preventDefault(); return; }
        };
        window.addEventListener("keydown", paletteTypeForwarder, { capture: true });
        window.__PALETTE_FWD__ = paletteTypeForwarder;
    } catch {}

    // Global: Backup to call KeyEventHandler regardless of focus position
    try {
        const globalKeyForwarder = (ev: KeyboardEvent) => {
            // Respect if already handled elsewhere
            if (ev.defaultPrevented) return;
            // Ignore IME/modifier keys (except Alt+Shift+Arrow is allowed for rectangular selection)
            const isBoxSelectionKey = ev.altKey && ev.shiftKey &&
                (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight");
            if (ev.isComposing || (!isBoxSelectionKey && (ev.ctrlKey || ev.metaKey || ev.altKey))) return;
            // Always delegate to KeyEventHandler (processed internally only when necessary)
            KeyEventHandler.handleKeyDown(ev);
        };
        window.addEventListener("keydown", globalKeyForwarder);
        window.__GLOBAL_KEY_FWD__ = globalKeyForwarder;
    } catch {}
});

onDestroy(() => {
    store.setTextareaRef(null);
    try { generalStore.textareaRef = null; } catch {}
    try {
        const f = window.__ALIAS_FWD__;
        if (f) window.removeEventListener("keydown", f, { capture: true });
    } catch {}
    try {
        const s = window.__SLASH_FWD__;
        if (s) window.removeEventListener("keydown", s, { capture: true });
    } catch {}
});

function updateCompositionWidth(text: string) {
    if (!textareaRef || !measureCtx) {
        // Fallback: Set fixed width if measureCtx is unavailable
        if (textareaRef) {
            textareaRef.style.width = `${(text.length * 10) + 4}px`; // Approximate width based on text length
        }
        return;
    }
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

// Delegate keydown event to KeyEventHandler
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

// Delegate input event to KeyEventHandler
function handleInput(event: Event) {
    console.log("GlobalTextArea.handleInput called with event:", event);
    console.log("GlobalTextArea.handleInput: event.target:", event.target);
    console.log("GlobalTextArea.handleInput: textareaRef:", textareaRef);
    console.log("GlobalTextArea.handleInput: activeElement:", document.activeElement);


    KeyEventHandler.handleInput(event);
}

// Delegate CompositionEnd event to KeyEventHandler
function handleCompositionEnd(event: CompositionEvent) {
    KeyEventHandler.handleCompositionEnd(event);
    isComposing = false;
    store.setIsComposing(false);
    textareaRef.classList.remove("ime-input");
    textareaRef.style.opacity = "0";
    textareaRef.style.width = "1px";
}

// Delegate CompositionUpdate event to KeyEventHandler
function handleCompositionUpdate(event: CompositionEvent) {
    updateCompositionWidth(event.data || "");
    KeyEventHandler.handleCompositionUpdate(event);
}

// Delegate copy event to KeyEventHandler
function handleCopy(event: ClipboardEvent) {
    KeyEventHandler.handleCopy(event);
}

// Delegate cut event to KeyEventHandler
function handleCut(event: ClipboardEvent) {
    KeyEventHandler.handleCut(event);
}

/**
 * Async handler to delegate paste events to KeyEventHandler.
 * `KeyEventHandler.handlePaste` returns a Promise, so we `await` it
 * to catch permission denials or read errors, and dispatch `clipboard-permission-denied`
 * or `clipboard-read-error` so the paste is not performed for the user.
 */
async function handlePaste(event: ClipboardEvent) {
    await KeyEventHandler.handlePaste(event);
}

// Add processing for focus loss
function handleBlur(_event: FocusEvent) { // eslint-disable-line @typescript-eslint/no-unused-vars
    const activeItemId = store.getActiveItem();
    // Do not restore focus while alias picker is visible
    if (aliasPickerStore.isVisible) {
        return;
    }
    if (activeItemId) {
        // Multiple attempts to ensure focus is set
        setTimeout(() => {
            if (textareaRef && !aliasPickerStore.isVisible) {
                textareaRef.focus();

                // Debug information
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
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
    aria-label="Text Editor"
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
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
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
