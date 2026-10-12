<script lang="ts">
import SqlEditor from "./SqlEditor.svelte";
import {
    applyCatalogMutation,
    catalogKindLabel,
    fetchCatalogSnapshot,
    isExecutableEnumSource,
    resolveCatalogTypeName,
    SqlCatalogTransportError,
    type SqlCatalogObjectDto,
    type SqlCatalogSnapshotDto,
} from "../../services/yjstable/sqlCatalogClient";

interface Props {
    /** Stable project id used by project-owned rooms. */
    projectId: string;
}

let { projectId }: Props = $props();

let snapshot = $state<SqlCatalogSnapshotDto | undefined>(undefined);
let loading = $state(true);
let loadError = $state<string | undefined>(undefined);
let selectedId = $state<string | undefined>(undefined);
let creating = $state(false);
let editing = $state(false);
let draft = $state("");
let draftId = $state("");
let busy = $state(false);
let mutationError = $state<string | undefined>(undefined);
let mutationInfo = $state<string | undefined>(undefined);
let confirmDelete = $state(false);

const selected = $derived(snapshot?.objects.find(object => object.id === selectedId));

function describeError(error: unknown): string {
    if (error instanceof SqlCatalogTransportError) {
        if (error.status === 401) return "Not authenticated. Sign in to manage SQL types.";
        if (error.status === 403) return "Access denied: this project is not shared with you.";
        return error.message;
    }
    return error instanceof Error ? error.message : String(error);
}

function describeResult(result: unknown): string | undefined {
    if (!result || typeof result !== "object") return undefined;
    const status = (result as { status?: unknown; }).status;
    if (status === "applied") return "Saved.";
    if (status === "no-op") return "No changes to save.";
    if (status === "refused") {
        const refusal = result as { reason?: unknown; diagnostics?: { message?: unknown; }[]; };
        const details = (refusal.diagnostics ?? [])
            .map(diagnostic => typeof diagnostic.message === "string" ? diagnostic.message : undefined)
            .filter((message): message is string => message !== undefined);
        const reason = typeof refusal.reason === "string" ? refusal.reason : "refused";
        return `Refused (${reason})${details.length > 0 ? `: ${details.join("; ")}` : ""}.`;
    }
    if (status === "unconfirmed") {
        const reason = (result as { reason?: unknown; }).reason;
        return `Not confirmed${typeof reason === "string" ? `: ${reason}` : ""}. Reload and retry.`;
    }
    if (status === "preview") return "Preview only: no changes were applied.";
    return undefined;
}

async function load() {
    loading = true;
    loadError = undefined;
    try {
        snapshot = await fetchCatalogSnapshot(projectId);
        if (selectedId && !snapshot.objects.some(object => object.id === selectedId)) selectedId = undefined;
    } catch (error) {
        loadError = describeError(error);
    } finally {
        loading = false;
    }
}

function startCreate() {
    creating = true;
    editing = false;
    confirmDelete = false;
    mutationError = undefined;
    mutationInfo = undefined;
    draftId = crypto.randomUUID();
    draft = "CREATE TYPE new_type AS ENUM ('value1', 'value2');";
    selectedId = undefined;
}

function inspect(object: SqlCatalogObjectDto) {
    creating = false;
    editing = false;
    confirmDelete = false;
    mutationError = undefined;
    mutationInfo = undefined;
    selectedId = object.id;
    draft = object.source;
}

function startEdit() {
    const current = selected;
    if (!current) return;
    creating = false;
    editing = true;
    confirmDelete = false;
    mutationError = undefined;
    mutationInfo = undefined;
    draftId = current.id;
    draft = current.source;
}

function cancel() {
    creating = false;
    editing = false;
    confirmDelete = false;
    mutationError = undefined;
    mutationInfo = undefined;
    if (!selectedId) draft = "";
}

async function submitCreate() {
    if (!snapshot) return;
    busy = true;
    mutationError = undefined;
    mutationInfo = undefined;
    try {
        const result = await applyCatalogMutation(projectId, {
            expectedRevision: snapshot.revision,
            intent: { operation: "create", object: { id: draftId, kind: "enum", source: draft } },
        });
        const summary = describeResult(result);
        await load();
        if (summary === "Saved.") {
            creating = false;
            selectedId = draftId;
            draft = "";
        }
        mutationInfo = summary;
        if (summary !== "Saved." && summary !== "No changes to save.") mutationError = summary;
    } catch (error) {
        mutationError = describeError(error);
    } finally {
        busy = false;
    }
}

async function submitEdit() {
    if (!snapshot || !selected) return;
    busy = true;
    mutationError = undefined;
    mutationInfo = undefined;
    try {
        const result = await applyCatalogMutation(projectId, {
            expectedRevision: snapshot.revision,
            intent: { operation: "replace", object: { id: selected.id, kind: "enum", source: draft } },
        });
        const summary = describeResult(result);
        await load();
        if (summary === "Saved." || summary === "No changes to save.") editing = false;
        mutationInfo = summary;
        if (summary !== "Saved." && summary !== "No changes to save.") mutationError = summary;
    } catch (error) {
        mutationError = describeError(error);
    } finally {
        busy = false;
    }
}

async function submitDelete() {
    if (!snapshot || !selected) return;
    if (!confirmDelete) {
        confirmDelete = true;
        return;
    }
    busy = true;
    mutationError = undefined;
    mutationInfo = undefined;
    try {
        const result = await applyCatalogMutation(projectId, {
            expectedRevision: snapshot.revision,
            intent: { operation: "delete", objectId: selected.id },
        });
        const summary = describeResult(result);
        await load();
        if (summary === "Saved.") {
            selectedId = undefined;
            editing = false;
            draft = "";
        }
        mutationInfo = summary;
        if (summary !== "Saved.") mutationError = summary;
    } catch (error) {
        mutationError = describeError(error);
    } finally {
        busy = false;
        confirmDelete = false;
    }
}

$effect(() => {
    void projectId;
    void load();
});
</script>

<div class="sql-catalog-panel" data-testid="sql-catalog-panel">
    <div class="panel-header">
        <div>
            <h2>Project SQL types</h2>
            <p class="panel-note">
                TYPE definitions owned by this project. Tables, records and Grid SELECT queries
                stay in their own editors; only <code>CREATE TYPE … AS ENUM</code> is executable here.
            </p>
        </div>
        <div class="panel-actions">
            <button type="button" data-testid="sql-catalog-refresh" disabled={loading || busy} onclick={load}>
                Refresh
            </button>
            <button type="button" data-testid="sql-catalog-new" disabled={loading || busy} onclick={startCreate}>
                New type
            </button>
        </div>
    </div>

    {#if snapshot}
        <p class="revision" data-testid="sql-catalog-revision">Revision <code>{snapshot.revision.slice(0, 12)}</code></p>
    {/if}

    {#if loading}
        <p class="loading">Loading catalog…</p>
    {:else if loadError}
        <p class="error" data-testid="sql-catalog-error">{loadError}</p>
    {:else if snapshot}
        {#if snapshot.objects.length === 0 && !creating}
            <p class="empty" data-testid="sql-catalog-empty">No SQL types yet. Create the first ENUM type.</p>
        {:else}
            <ul class="catalog-list" data-testid="sql-catalog-list">
                {#each snapshot.objects as object (object.id)}
                    {@const typeName = resolveCatalogTypeName(object.source)}
                    {@const executable = object.kind === "enum" && isExecutableEnumSource(object.source)}
                    <li>
                        <button
                            type="button"
                            class="catalog-item"
                            class:active={object.id === selectedId && !creating}
                            data-testid="sql-catalog-item"
                            data-object-id={object.id}
                            onclick={() => inspect(object)}
                        >
                            <span class="catalog-name" data-testid="sql-catalog-name">{typeName ?? "(unsupported source)"}</span>
                            <span class="catalog-kind" data-testid="sql-catalog-kind">{catalogKindLabel(object.kind)}</span>
                            {#if !executable}
                                <span class="catalog-unsupported" data-testid="sql-catalog-unsupported">Unsupported</span>
                            {/if}
                            <span class="catalog-id" title={object.id}>{object.id.slice(0, 8)}</span>
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    {/if}

    {#if creating}
        <section class="editor-section" data-testid="sql-catalog-create-form">
            <h3>New ENUM type</h3>
            <p class="panel-note">One unqualified <code>CREATE TYPE … AS ENUM</code> declaration per object.</p>
            <SqlEditor
                testId="sql-catalog-editor"
                ariaLabel="New type source (CREATE TYPE AS ENUM)"
                value={draft}
                minHeight={140}
                maxHeight={320}
                onChange={(next) => {
                    draft = next;
                }}
            />
            <div class="editor-actions">
                <button type="button" data-testid="sql-catalog-create" disabled={busy} onclick={submitCreate}>
                    {busy ? "Creating…" : "Create type"}
                </button>
                <button type="button" data-testid="sql-catalog-cancel" disabled={busy} onclick={cancel}>Cancel</button>
            </div>
        </section>
    {:else if selected}
        <section class="editor-section" data-testid="sql-catalog-detail">
            <h3 data-testid="sql-catalog-detail-name">{resolveCatalogTypeName(selected.source) ?? "(unsupported source)"}</h3>
            <p class="panel-note">
                <span data-testid="sql-catalog-detail-kind">{catalogKindLabel(selected.kind)}</span>
                · <code>{selected.id}</code>
                {#if !(selected.kind === "enum" && isExecutableEnumSource(selected.source))}
                    · <span data-testid="sql-catalog-detail-unsupported">Unsupported declaration: stored but not executable.</span>
                {/if}
            </p>
            {#if editing}
                <SqlEditor
                    testId="sql-catalog-editor"
                    ariaLabel="Edit type source (CREATE TYPE AS ENUM)"
                    value={draft}
                    minHeight={140}
                    maxHeight={320}
                    onChange={(next) => {
                        draft = next;
                    }}
                />
            {:else}
                <SqlEditor
                    testId="sql-catalog-editor"
                    ariaLabel="Type source (CREATE TYPE AS ENUM)"
                    value={selected.source}
                    readOnly={true}
                    minHeight={140}
                    maxHeight={320}
                />
            {/if}
            <div class="editor-actions">
                {#if editing}
                    <button type="button" data-testid="sql-catalog-save" disabled={busy} onclick={submitEdit}>
                        {busy ? "Saving…" : "Save changes"}
                    </button>
                    <button type="button" data-testid="sql-catalog-cancel" disabled={busy} onclick={cancel}>Cancel</button>
                {:else}
                    <button type="button" data-testid="sql-catalog-edit" disabled={busy} onclick={startEdit}>
                        Edit source
                    </button>
                    <button
                        type="button"
                        data-testid={confirmDelete ? "sql-catalog-confirm-delete" : "sql-catalog-delete"}
                        disabled={busy}
                        onclick={submitDelete}
                    >
                        {confirmDelete ? "Confirm delete" : "Delete"}
                    </button>
                {/if}
            </div>
        </section>
    {/if}

    {#if mutationError}
        <p class="error" data-testid="sql-catalog-mutation-error">{mutationError}</p>
    {:else if mutationInfo}
        <p class="info" data-testid="sql-catalog-mutation-info">{mutationInfo}</p>
    {/if}
</div>

<style>
.sql-catalog-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
}

.panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.panel-header h2 {
    margin: 0;
    font-size: 1.1rem;
}

.panel-note {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: #6b7280;
}

.panel-note code {
    font-family: ui-monospace, monospace;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 1px 5px;
}

.panel-actions {
    display: flex;
    gap: 8px;
}

.panel-actions button,
.editor-actions button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 0.85rem;
}

.panel-actions button:disabled,
.editor-actions button:disabled {
    opacity: 0.5;
    cursor: default;
}

.revision {
    margin: 0;
    font-size: 0.75rem;
    color: #6b7280;
}

.revision code {
    font-family: ui-monospace, monospace;
}

.loading,
.empty,
.info {
    color: #6b7280;
    font-size: 0.85rem;
    margin: 0;
}

.error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
}

.catalog-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.catalog-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    background: white;
    padding: 8px 10px;
    cursor: pointer;
}

.catalog-item.active {
    border-color: #2563eb;
    background: #eff6ff;
}

.catalog-name {
    font-family: ui-monospace, monospace;
    font-weight: 600;
    color: #111827;
}

.catalog-kind {
    font-size: 0.7rem;
    color: #4b5563;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 1px 6px;
}

.catalog-unsupported {
    font-size: 0.7rem;
    color: #b45309;
    background: #fef3c7;
    border-radius: 3px;
    padding: 1px 6px;
}

.catalog-id {
    margin-left: auto;
    font-size: 0.7rem;
    color: #9ca3af;
    font-family: ui-monospace, monospace;
}

.editor-section {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 10px;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.editor-section h3 {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.95rem;
}

.editor-actions {
    display: flex;
    gap: 8px;
}
</style>
