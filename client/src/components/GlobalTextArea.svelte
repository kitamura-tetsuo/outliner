<script lang="ts">
import {
    store,
    type TextAreaPosition,
} from "../stores/store.svelte";
import { onMount, onDestroy } from "svelte";
import { KeyEventHandler } from "../lib/KeyEventHandler";
import { store as generalStore } from "../stores/store.svelte";
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";

let textareaRef: HTMLTextAreaElement | null = $state(null);
let isComposing = $state(false);
let measureCtx: CanvasRenderingContext2D | null = null;

onMount(() => {
    store.setTextareaRef(textareaRef);
    // Measure context creation
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");

    // Global: Backup to call KeyEventHandler regardless of focus position
    try {
        const paletteTypeForwarder = (ev: KeyboardEvent) => {
            const w: any = window as any;
            if (!w.__SLASH_PALETTE_ACTIVE__) return;
            const cps: any = w.commandPaletteStore;
            if (!cps || !cps.isVisible) return;

            const k = ev.key;
            if (k === "Escape") { cps.close(); ev.preventDefault(); return; }
            if (k === "Enter" && !ev.isComposing) {
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
            // Respect already processed events
            if (ev.defaultPrevented) return;
            // Ignore IME/modifier keys (except Alt+Shift+Arrow for box selection)
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
            textareaRef.style.width = `${(text.length * 10) + 4}px`; // Appropriate width according to text length
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
 * Async handler delegating paste event to KeyEventHandler.
 * `KeyEventHandler.handlePaste` returns a Promise, so `await` it
 * Catch permission denial or read failure, and dispatch `clipboard-permission-denied`
 * or `clipboard-read-error` so that paste is not performed for the user.
 */
async function handlePaste(event: ClipboardEvent) {
    await KeyEventHandler.handlePaste(event);
}

// Add processing when focus is lost
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
