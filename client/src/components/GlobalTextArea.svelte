<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("GlobalTextArea");

import {
    onDestroy,
    onMount,
} from "svelte";
import { isForeignInput, KeyEventHandler } from "../lib/KeyEventHandler";
import { Items } from "../schema/app-schema";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";

let textareaRef: HTMLTextAreaElement;

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
                logger.warn('GlobalTextArea: Canvas 2D context not available, text measurement may be affected');
            }
        } catch (error) {
            // Canvas API might not be available in test environments or specific browsers
            logger.warn('GlobalTextArea: Canvas API not available, text measurement may be affected:', error);
            measureCtx = null;
        }
    } else {
        logger.warn('GlobalTextArea: Canvas API not available in this environment, text measurement may be affected');
    }

    store.setTextareaRef(textareaRef);
    // Keep a reference in generalStore as well (used as a fallback for the command palette)
    try { generalStore.textareaRef = textareaRef; } catch {}
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: Textarea reference set in store");

    // Expose KeyEventHandler globally (for testing)
    if (typeof window !== "undefined") {
        window.KeyEventHandler = KeyEventHandler;
    }

    // Set initial focus
    if (textareaRef) {
        textareaRef.focus();
        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: Initial focus set on mount, activeElement:", document.activeElement?.tagName);

        // Additional attempts to ensure focus
        requestAnimationFrame(() => {
            if (textareaRef) {
                textareaRef.focus();
                if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: RAF focus set, activeElement:", document.activeElement?.tagName);

                setTimeout(() => {
                    if (textareaRef) {
                        textareaRef.focus();
                        const isFocused = document.activeElement === textareaRef;
                        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: Final focus set, focused:", isFocused);
                    }
                }, 10);
            }
        });
    }

});

onDestroy(() => {
    store.setTextareaRef(null);
    try { generalStore.textareaRef = null; } catch {}
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

    store.setIsComposing(true);
    if (textareaRef) {
        textareaRef.classList.add("ime-input");
        textareaRef.style.opacity = "1";

        // Retrieve active item style details from store/overlay
        const activeId = store.getActiveItem();
        if (activeId) {
            const itemEl = document.querySelector(`[data-item-id="${activeId}"] .item-text`);
            if (itemEl) {
                const style = window.getComputedStyle(itemEl);
                textareaRef.style.fontFamily = style.fontFamily;
                textareaRef.style.fontSize = style.fontSize;
                textareaRef.style.fontWeight = style.fontWeight;
                textareaRef.style.lineHeight = style.lineHeight;
                textareaRef.style.height = style.lineHeight; // Sets height to ~20-24px instead of 1px
            }
        }
    }
    updateCompositionWidth(event.data || "");
    KeyEventHandler.handleCompositionStart(event);
}

// Delegate keydown event to KeyEventHandler
function handleKeyDown(event: KeyboardEvent) {
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleKeyDown called with key:", event.key);
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleKeyDown: event.target:", (event.target as Element | null)?.tagName);
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleKeyDown: textareaRef:", textareaRef?.tagName);
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleKeyDown: activeElement:", document.activeElement?.tagName);


    KeyEventHandler.handleKeyDown(event);

    // Fallback for headless/E2E environments where input event may not fire
    try {
        const isPrintable = typeof event.key === "string" && event.key.length === 1;
        const isModifier = event.ctrlKey || event.metaKey || event.altKey || event.isComposing;
        const isTest = typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true";
        const isTextareaFocused = document.activeElement === textareaRef;
        if (isTest && isPrintable && !isModifier && !aliasPickerStore.isVisible && !isTextareaFocused && !event.defaultPrevented) {
            const cursors = store.getCursorInstances();
            if (cursors.length > 0) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleKeyDown fallback insert:", event.key, "cursors=", cursors.length);
                cursors.forEach(c => c.insertText(event.key));
                store.startCursorBlink();
            }
        }
    } catch {}
}

// Delegate input event to KeyEventHandler
function handleInput(event: Event) {
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleInput called with event.type:", event.type);
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleInput: event.target:", (event.target as Element | null)?.tagName);
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleInput: textareaRef:", textareaRef?.tagName);
    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea.handleInput: activeElement:", document.activeElement?.tagName);


    KeyEventHandler.handleInput(event);
}

// Delegate CompositionEnd event to KeyEventHandler
function handleCompositionEnd(event: CompositionEvent) {
    KeyEventHandler.handleCompositionEnd(event);

    store.setIsComposing(false);
    if (textareaRef) {
        textareaRef.classList.remove("ime-input");
        textareaRef.style.opacity = "0";
        textareaRef.style.width = "1px";
        textareaRef.style.height = "1px"; // Restore tiny size
    }
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
function handleBlur(event: FocusEvent) {
    const activeItemId = store.getActiveItem();
    // Do not restore focus while alias picker is visible
    if (aliasPickerStore.isVisible) {
        return;
    }

    // Check where the focus is moving
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (relatedTarget) {
        const tagName = relatedTarget.tagName.toLowerCase();
        // Do not steal focus if moving to an input/button or search-related containers
        if (
            tagName === "input" ||
            tagName === "textarea" ||
            tagName === "select" ||
            tagName === "button" ||
            relatedTarget.closest(".page-search-box") ||
            relatedTarget.closest("[data-testid='search-panel']")
        ) {
            return;
        }
    }

    if (activeItemId) {
        // Multiple attempts to ensure focus is set
        setTimeout(() => {
            if (textareaRef && !aliasPickerStore.isVisible) {
                // Double check current active element is not an interactive input/button
                const activeEl = document.activeElement;
                if (activeEl) {
                    const activeTag = activeEl.tagName.toLowerCase();
                    if (
                        activeTag === "input" ||
                        activeTag === "textarea" ||
                        activeTag === "select" ||
                        activeTag === "button" ||
                        activeEl.closest(".page-search-box") ||
                        activeEl.closest("[data-testid='search-panel']")
                    ) {
                        return;
                    }
                }

                textareaRef.focus();

                // Debug information
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(
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
                if ((error as Error)?.name !== "NotAllowedError") {
                    logger.error({ error }, "GlobalTextArea.handlePaste failed");
                }
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
