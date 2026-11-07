<script lang="ts">
import { onMount } from "svelte";
import type { GridNavDirection } from "../../../services/yjstable/gridKeyboardNav";
import type { TextLineBreakPolicy } from "../textCellLineBreakPolicy";

interface Props {
    value: unknown; editable: boolean; ariaLabel?: string; editing?: boolean; editSeed?: string;
    lineBreakPolicy?: TextLineBreakPolicy;
    onCommit: (value: string | number | boolean | null) => void;
    onRequestFocus?: (direction?: GridNavDirection) => void;
}
let { value, editable, ariaLabel, editing = $bindable(false), editSeed, lineBreakPolicy, onCommit, onRequestFocus }: Props = $props();
let draft = $state("");
let textarea: HTMLTextAreaElement | undefined = $state();
let denial = $state<string | undefined>();
let sessionOriginal = "";
let sessionNormalizedOriginal = "";
let acceptedDraft = "";
let acceptedSelection = { start: 0, end: 0 };
let finished = false;
let sessionGeneration = 0;

function displayedValue(): string {
    return value === null || value === undefined ? "" : String(value);
}

function resize() {
    if (!textarea?.isConnected || textarea.clientWidth === 0) return;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const style = getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
    const chrome = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
        + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
    const cap = Math.max(0, viewportHeight * 0.4);
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(cap, Math.max(3 * lineHeight + chrome, textarea.scrollHeight))}px`;
    textarea.style.overflowY = textarea.scrollHeight > textarea.clientHeight + 1 ? "auto" : "hidden";
}
function focusAndSize(node: HTMLTextAreaElement) {
    const generation = ++sessionGeneration;
    sessionOriginal = displayedValue();
    sessionNormalizedOriginal = sessionOriginal.replace(/\r\n?/g, "\n");
    draft = editSeed ?? sessionNormalizedOriginal;
    acceptedDraft = draft;
    acceptedSelection = { start: draft.length, end: draft.length };
    denial = undefined;
    finished = false;
    textarea = node;
    node.value = draft;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
    observer?.observe(node.parentElement ?? node);
    const viewport = window.visualViewport;
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    requestAnimationFrame(resize);
    return { destroy() {
        observer?.disconnect();
        window.removeEventListener("resize", resize);
        viewport?.removeEventListener("resize", resize);
        if (textarea === node && sessionGeneration === generation) textarea = undefined;
    } };
}
function remember(node: HTMLTextAreaElement) {
    acceptedDraft = node.value;
    acceptedSelection = { start: node.selectionStart, end: node.selectionEnd };
}
function reject(node: HTMLTextAreaElement, rollback: boolean) {
    denial = lineBreakPolicy?.kind === "allowed" ? undefined : lineBreakPolicy?.reason ?? "This destination does not accept line breaks.";
    if (!rollback) return;
    const generation = sessionGeneration;
    draft = acceptedDraft;
    requestAnimationFrame(() => {
        if (generation !== sessionGeneration || node !== textarea) return;
        node.value = acceptedDraft;
        node.setSelectionRange(acceptedSelection.start, acceptedSelection.end);
        resize();
    });
}
function finish(node: HTMLTextAreaElement, direction?: GridNavDirection) {
    if (finished || !editing) return;
    finished = true;
    const committed = editSeed === undefined && node.value === sessionNormalizedOriginal ? sessionOriginal : node.value;
    try { onCommit(committed); } finally { editing = false; }
    onRequestFocus?.(direction);
}
onMount(() => () => { finished = true; });
</script>

{#if editing && editable}
    <textarea
        bind:this={textarea}
        use:focusAndSize
        data-block-dnd-owner="grid-text-editor"
        data-block-dnd-type="text/plain"
        class="cell-input text-cell-input"
        aria-label={ariaLabel || "Edit cell value"}
        aria-describedby={denial ? "text-cell-line-break-status" : undefined}
        wrap="soft"
        bind:value={draft}
        onbeforeinput={(event) => {
            const e = event as InputEvent;
            if (lineBreakPolicy?.kind !== "allowed" && (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph" || /[\r\n]/.test(e.data ?? ""))) {
                acceptedSelection = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
                e.preventDefault(); reject(event.currentTarget, false);
            } else remember(event.currentTarget);
        }}
        onpaste={(event) => {
            if (lineBreakPolicy?.kind !== "allowed" && /[\r\n]/.test(event.clipboardData?.getData("text/plain") ?? "")) {
                event.preventDefault(); reject(event.currentTarget, false);
            }
        }}
        ondrop={(event) => {
            if (lineBreakPolicy?.kind !== "allowed" && /[\r\n]/.test(event.dataTransfer?.getData("text/plain") ?? "")) {
                event.preventDefault(); reject(event.currentTarget, false);
            }
        }}
        oninput={(event) => {
            const node = event.currentTarget;
            if (lineBreakPolicy?.kind !== "allowed" && /[\r\n]/.test(node.value)) reject(node, true);
            else { denial = undefined; remember(node); resize(); }
        }}
        oncompositionend={() => requestAnimationFrame(resize)}
        onblur={(event) => finish(event.currentTarget)}
        onkeydown={(event) => {
            if (event.isComposing) return;
            if (event.key === "Enter" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                event.preventDefault();
                if (lineBreakPolicy?.kind !== "allowed") return reject(event.currentTarget, false);
                event.currentTarget.setRangeText("\n", event.currentTarget.selectionStart, event.currentTarget.selectionEnd, "end");
                draft = event.currentTarget.value; remember(event.currentTarget); resize();
            } else if (event.key === "Enter") {
                event.preventDefault(); finish(event.currentTarget, event.shiftKey ? "up" : "down");
            } else if (event.key === "Tab") {
                event.preventDefault(); finish(event.currentTarget, event.shiftKey ? "left" : "right");
            } else if (event.key === "Escape") {
                finished = true; editing = false; onRequestFocus?.();
            }
        }}
    ></textarea>
    {#if denial}<span id="text-cell-line-break-status" class="editor-status" role="alert">{denial}</span>{/if}
{:else}
    <button type="button" class="cell-value text-cell-value" aria-label={displayedValue() === "" ? `Empty cell, ${ariaLabel || "cell"}` : `${displayedValue()}, ${ariaLabel || "cell"}`} class:readonly={!editable} aria-disabled={!editable ? "true" : "false"} onclick={() => { if (editable) editing = true; }}>{displayedValue()}</button>
{/if}

<style>
.cell-input { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; border: none; padding: 2px 4px; outline: 2px solid #2563eb; background: white; font: inherit; line-height: inherit; resize: none; overflow-wrap: anywhere; white-space: pre-wrap; }
.cell-value { display: block; width: 100%; max-width: 100%; box-sizing: border-box; text-align: left; background: transparent; border: none; padding: 2px 4px; min-height: 1.4em; cursor: pointer; font: inherit; color: inherit; }
.text-cell-value { white-space: pre-wrap; overflow-wrap: anywhere; }
.cell-value.readonly { cursor: default; color: #4b5563; }
.editor-status { display: block; color: #b91c1c; font-size: .75rem; }
</style>
