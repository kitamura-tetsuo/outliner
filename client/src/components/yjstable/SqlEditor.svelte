<script lang="ts">
// Shared SQL editing surface for the Grid (Schema and Query).
//
// Intentionally thin: it knows nothing about Yjs tables, schema application or
// query execution. Callers hand it a string and get strings back, so Monaco
// stays isolated behind this one wrapper and future SQL intelligence (schema
// aware completion, PGlite diagnostics, formatting) has a single home.
//
// Three properties matter to its callers:
//   * multiline SQL round-trips byte for byte -- no HTML input collapsing
//     `r\nWHERE` into `rWHERE`;
//   * `data-foreign-editor` makes the whole subtree an event-ownership boundary,
//     so Enter / Tab / Backspace / arrows / Ctrl+C,X,V,A,Z / Ctrl+F belong to
//     Monaco while it has focus and never reach the containing OutlinerItem;
//   * Monaco is imported lazily and every editor, model and listener it creates
//     is disposed on unmount, because an outline page can mount many of these.

import { onDestroy, onMount, untrack } from "svelte";
import { getLogger } from "../../lib/logger";
import { loadMonaco, type MonacoModule } from "../../lib/monaco/monacoLoader";

type CodeEditor = import("monaco-editor/editor.js").editor.IStandaloneCodeEditor;
type TextModel = import("monaco-editor/editor.js").editor.ITextModel;
type Disposable = import("monaco-editor/editor.js").IDisposable;

const logger = getLogger("SqlEditor");

interface Props {
    /** The SQL to show. Assigning a different string replaces the model text. */
    value: string;
    readOnly?: boolean;
    /** Accessible name, e.g. "Schema (CREATE TABLE)". */
    ariaLabel?: string;
    /** `data-testid` for the editor root. */
    testId?: string;
    minHeight?: number;
    maxHeight?: number;
    /** Fired for every edit, with the exact model text (newlines included). */
    onChange?: (value: string) => void;
    /** Fired when focus leaves the editor, and on unmount if edits are pending. */
    onBlur?: (value: string) => void;
}

let {
    value,
    readOnly = false,
    ariaLabel,
    testId,
    minHeight = 120,
    maxHeight = 320,
    onChange,
    onBlur,
}: Props = $props();

let mountEl = $state<HTMLDivElement | undefined>(undefined);
/** `loading` until the runtime arrives, `unavailable` if the import failed. */
let status = $state<"loading" | "ready" | "unavailable">("loading");
/** Content height reported by Monaco; `minHeight` until it has measured itself. */
let contentHeight = $state<number | undefined>(undefined);
const editorHeight = $derived(Math.min(Math.max(contentHeight ?? minHeight, minHeight), maxHeight));

let editor: CodeEditor | undefined;
let model: TextModel | undefined;
let disposables: Disposable[] = [];
let resizeObserver: ResizeObserver | undefined;
let layoutFrame: number | undefined;
let destroyed = false;

// The text this component last showed or emitted. It is what distinguishes an
// external assignment (push it into the model) from the echo of our own
// `onChange` (ignore it -- rewriting the model would destroy the cursor).
// Deliberately not `$state`: Monaco renders the text, so a reactive copy would
// only add a second source of truth.
let lastSyncedValue = untrack(() => value);
/** Set on edit, cleared on commit: is there anything to flush on unmount? */
let dirty = false;

// Monaco owns its text imperatively, so a plain string prop cannot be bound to
// it declaratively. This is the "no other way" $effect exception (AGENTS.md §8):
// mirror the prop into the model whenever it diverges from what we last saw.
$effect(() => {
    const next = value;
    if (next === lastSyncedValue) return;
    lastSyncedValue = next;
    untrack(() => applyExternalValue(next));
});

function applyExternalValue(next: string) {
    if (!model || model.getValue() === next) return;
    // pushEditOperations rather than setValue: it keeps the undo stack and lets
    // Monaco map the existing selection through the edit.
    const selections = editor?.getSelections() ?? null;
    model.pushEditOperations(
        selections,
        [{ range: model.getFullModelRange(), text: next }],
        () => selections,
    );
    dirty = false;
}

/** Current editor text, or the last known value while Monaco is still loading. */
function currentValue(): string {
    return model?.getValue() ?? lastSyncedValue;
}

function emitChange(text: string) {
    lastSyncedValue = text;
    dirty = true;
    onChange?.(text);
}

function commit() {
    if (!dirty) return;
    dirty = false;
    onBlur?.(currentValue());
}

function createEditor(monaco: MonacoModule, container: HTMLDivElement) {
    model = monaco.editor.createModel(lastSyncedValue, "sql");
    editor = monaco.editor.create(container, {
        model,
        readOnly,
        ariaLabel,
        // Layout is driven by the ResizeObserver below instead: Monaco's own
        // `automaticLayout` re-measures synchronously inside the observer
        // callback, which makes the browser report "ResizeObserver loop
        // completed with undelivered notifications" as an uncaught error.
        automaticLayout: false,
        minimap: { enabled: false },
        lineNumbers: "on",
        // Long SQL scrolls horizontally rather than reflowing: wrapped lines
        // hide the statement structure this editor exists to expose.
        wordWrap: "off",
        scrollBeyondLastLine: false,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 13,
        tabSize: 2,
        renderLineHighlight: "none",
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        folding: false,
        padding: { top: 6, bottom: 6 },
        // The editor must never invent SQL. Auto-closed brackets and quotes,
        // re-indentation and word-based suggestions all rewrite the statement
        // behind the user's back, and a wrong character in a CREATE TABLE or a
        // SELECT is a query error rather than a cosmetic slip. Real, schema
        // aware completion is deliberately left to a follow-up.
        autoClosingBrackets: "never",
        autoClosingQuotes: "never",
        autoSurround: "never",
        autoIndent: "none",
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: "off",
        wordBasedSuggestions: "off",
        // Let the page keep scrolling once the editor is at its own end,
        // otherwise a Grid deep in a document becomes a scroll trap.
        scrollbar: { alwaysConsumeMouseWheel: false },
    });

    disposables.push(model.onDidChangeContent(() => {
        const text = model?.getValue() ?? "";
        if (text === lastSyncedValue) return;
        emitChange(text);
    }));
    // Blur of the *widget*, not of the inner textarea: moving focus to Monaco's
    // own find widget is not leaving the editor, but tabbing to another Grid
    // control is, and that must still commit the latest text.
    disposables.push(editor.onDidBlurEditorWidget(() => commit()));
    disposables.push(editor.onDidContentSizeChange((e) => {
        contentHeight = e.contentHeight;
    }));

    // Re-layout when the Grid configuration panel changes width. The relayout
    // is deferred to the next frame so it never runs inside the observer
    // callback that triggered it. Layout tracking is an enhancement, so an
    // environment without ResizeObserver simply keeps the initial size.
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
            if (layoutFrame !== undefined) return;
            layoutFrame = requestAnimationFrame(() => {
                layoutFrame = undefined;
                editor?.layout();
            });
        });
        resizeObserver.observe(container);
    }
}

onMount(() => {
    void (async () => {
        let monaco: MonacoModule;
        try {
            monaco = await loadMonaco();
        } catch (error) {
            logger.error({ error }, "Monaco Editor failed to load; falling back to a plain textarea");
            if (!destroyed) status = "unavailable";
            return;
        }
        // The panel can be closed again while the chunk is in flight.
        if (destroyed || !mountEl) return;
        try {
            createEditor(monaco, mountEl);
            status = "ready";
        } catch (error) {
            logger.error({ error }, "Monaco Editor failed to initialise; falling back to a plain textarea");
            // `createEditor` may have got as far as creating the model. Left in
            // place it would keep answering `currentValue()`, so a commit from
            // the fallback textarea would write the stale text back.
            releaseEditor();
            if (!destroyed) status = "unavailable";
        }
    })();
});

/** Tears down everything `createEditor` may have created, in reverse order. */
function releaseEditor() {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
    layoutFrame = undefined;
    for (const disposable of disposables) disposable.dispose();
    disposables = [];
    editor?.dispose();
    editor = undefined;
    // The model is created for this editor alone, so it is ours to dispose;
    // leaking it would keep the text buffer and its tokenization alive for the
    // lifetime of the page.
    model?.dispose();
    model = undefined;
}

onDestroy(() => {
    destroyed = true;
    // Closing the panel while the editor still has focus never fires a blur, so
    // the pending text would otherwise be lost.
    commit();
    releaseEditor();
});
</script>

<!--
    `data-foreign-editor` (see lib/foreignEditor.ts, asserted in SqlEditor.test.ts)
    is the keyboard/clipboard ownership marker the outliner checks.

    `data-block-dnd-owner` (bare, no type filter): text dragged inside Monaco is
    Monaco's, and OutlinerItem's capture-phase drop handler must not consume it.
-->
<div
    class="sql-editor"
    data-testid={testId}
    data-foreign-editor="sql"
    data-sql-editor-status={status}
    data-block-dnd-owner="sql-editor"
    role="group"
    aria-label={ariaLabel}
    style={`--sql-editor-min-height: ${minHeight}px; --sql-editor-max-height: ${maxHeight}px;`}
>
    {#if status !== "unavailable"}
        <div
            class="sql-editor-surface"
            class:pending={status === "loading"}
            style={`height: ${editorHeight}px;`}
            bind:this={mountEl}
        ></div>
    {/if}
    {#if status === "loading"}
        <p class="sql-editor-status" data-testid={testId ? `${testId}-loading` : undefined}>Loading SQL editor…</p>
    {:else if status === "unavailable"}
        <!--
            Progressive enhancement, not a test seam: when the Monaco chunk cannot
            be fetched the SQL must still be editable, and a textarea preserves
            multiline text exactly the way the editor does.
        -->
        <textarea
            class="sql-editor-fallback"
            data-testid={testId ? `${testId}-fallback` : undefined}
            aria-label={ariaLabel}
            spellcheck="false"
            rows="8"
            readonly={readOnly}
            {value}
            oninput={(e) => emitChange((e.target as HTMLTextAreaElement).value)}
            onblur={() => commit()}
        ></textarea>
    {/if}
</div>

<style>
.sql-editor {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    overflow: hidden;
}

.sql-editor-surface {
    width: 100%;
    min-height: var(--sql-editor-min-height);
    max-height: var(--sql-editor-max-height);
}

.sql-editor-surface.pending {
    display: none;
}

.sql-editor-status {
    margin: 0;
    padding: 8px;
    color: #6b7280;
    font-size: 0.8rem;
}

.sql-editor-fallback {
    display: block;
    width: 100%;
    border: 0;
    resize: vertical;
    min-height: var(--sql-editor-min-height);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8rem;
    padding: 6px;
}
</style>
