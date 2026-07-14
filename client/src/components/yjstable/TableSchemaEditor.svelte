<script lang="ts">
// Schema Definition editor: a plain textarea with an explicit Apply button.
// Nothing is parsed while typing; on Apply the draft is validated in a
// throwaway PGlite schema and, when the diff would drop columns or change
// types, a warning dialog asks for confirmation before existing data is
// touched.

import type { ParsedTableSchema, SchemaDiff } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import type { TableSyncAdapter } from "../../services/yjstable/tableSyncAdapter";

interface Props {
    handles: TableHandles;
    adapter: TableSyncAdapter;
    schemaError?: string;
}

let { handles, adapter, schemaError }: Props = $props();

let draft = $state(handles.schemaText.toString());
let applyError = $state<string | undefined>(undefined);
let applying = $state(false);
let pendingChange = $state<{ parsed: ParsedTableSchema; diff: SchemaDiff; } | undefined>(undefined);

async function apply() {
    applyError = undefined;
    pendingChange = undefined;
    applying = true;
    try {
        const change = await adapter.prepareSchemaChange(draft);
        const destructive = change.diff.removedColumns.length > 0
            || change.diff.typeChangedColumns.length > 0;
        if (destructive) {
            // Warning dialog: applying will delete removed-column data and
            // re-validate type-changed columns.
            pendingChange = change;
        } else {
            await adapter.applySchema(change.parsed);
        }
    } catch (err) {
        applyError = err instanceof Error ? err.message : String(err);
    } finally {
        applying = false;
    }
}

async function confirmPending() {
    const change = pendingChange;
    pendingChange = undefined;
    if (!change) return;
    applying = true;
    try {
        await adapter.applySchema(change.parsed);
    } catch (err) {
        applyError = err instanceof Error ? err.message : String(err);
    } finally {
        applying = false;
    }
}

function cancelPending() {
    pendingChange = undefined;
}
</script>

<div class="schema-editor" data-testid="yjs-table-schema-editor">
    <label class="editor-label" for="yjs-table-schema-input">Schema (CREATE TABLE)</label>
    <textarea
        id="yjs-table-schema-input"
        data-testid="yjs-table-schema-input"
        rows="6"
        spellcheck="false"
        value={draft}
        oninput={(e) => {
            draft = (e.target as HTMLTextAreaElement).value;
        }}
    ></textarea>
    <div class="editor-actions">
        <button
            type="button"
            data-testid="yjs-table-schema-apply"
            disabled={applying}
            onclick={apply}
        >{applying ? "Applying..." : "Apply schema"}</button>
    </div>

    {#if applyError}
        <p class="error" data-testid="yjs-table-schema-error">{applyError}</p>
    {/if}
    {#if schemaError}
        <p class="error">{schemaError}</p>
    {/if}

    {#if pendingChange}
        <div class="warning-dialog" role="alertdialog" data-testid="yjs-table-schema-warning">
            <p class="warning-title">This schema change affects existing data:</p>
            <ul>
                {#if pendingChange.diff.removedColumns.length > 0}
                    <li>
                        Columns removed (their stored data will be deleted):
                        {pendingChange.diff.removedColumns.join(", ")}
                    </li>
                {/if}
                {#if pendingChange.diff.typeChangedColumns.length > 0}
                    <li>
                        Column types changed (values will be re-validated):
                        {pendingChange.diff.typeChangedColumns.map((c) => `${c.name} (${c.from} -> ${c.to})`).join(", ")}
                    </li>
                {/if}
            </ul>
            <div class="warning-actions">
                <button type="button" data-testid="yjs-table-schema-confirm" onclick={confirmPending}>
                    Apply anyway
                </button>
                <button type="button" data-testid="yjs-table-schema-cancel" onclick={cancelPending}>
                    Cancel
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
.schema-editor {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.editor-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
}

textarea {
    width: 100%;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 6px;
    background: white;
}

.editor-actions button,
.warning-actions button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f9fafb;
    padding: 2px 10px;
    cursor: pointer;
    font-size: 0.875rem;
}

.editor-actions button:hover,
.warning-actions button:hover {
    background: #f3f4f6;
}

.error {
    color: #dc2626;
    font-size: 0.8rem;
    margin: 2px 0;
}

.warning-dialog {
    border: 1px solid #f59e0b;
    background: #fffbeb;
    border-radius: 4px;
    padding: 8px;
    font-size: 0.85rem;
}

.warning-title {
    font-weight: 600;
    margin: 0 0 4px;
}

.warning-dialog ul {
    margin: 0 0 6px;
    padding-left: 18px;
}

.warning-actions {
    display: flex;
    gap: 8px;
}
</style>
