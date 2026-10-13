<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type * as Y from "yjs";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import {
    destroyKanbanUndoManager,
    getKanban,
    retainKanbanUndoManager,
    type KanbanHandles,
    type KanbanSettings,
    updateKanban,
} from "../../services/yjstable/kanbanDocs";
import { type KanbanCard, type KanbanProjection, KanbanQueryRunner } from "../../services/yjstable/kanbanQueryRunner";
import { KanbanCardOperationController, type KanbanCardOperationState } from "../../services/yjstable/kanbanCardOperations";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import type { TableRecordValue } from "../../services/yjstable/tableDocs";
import SqlEditor from "../yjstable/SqlEditor.svelte";

interface SqlEditorHandle { getValue(): string; }

interface Props { projectDoc: Y.Doc; projectId?: string; kanban: KanbanHandles; isReadOnly?: boolean; }
let { projectDoc, projectId, kanban, isReadOnly = false }: Props = $props();
// Props are immutable for this mounted lifetime: the parent keys by identity.
// svelte-ignore state_referenced_locally
let committed = $state<KanbanSettings>(getKanban(projectDoc, kanban.kanbanId)!);
// svelte-ignore state_referenced_locally
let draft = $state<KanbanSettings>({ ...committed, detailFields: [...committed.detailFields], laneOrder: [...committed.laneOrder] });
// svelte-ignore state_referenced_locally
let baseline = $state<KanbanSettings>({ ...draft, detailFields: [...draft.detailFields], laneOrder: [...draft.laneOrder] });
// svelte-ignore state_referenced_locally
let queryDraft = $state(committed.query);
let projection = $state<KanbanProjection>({ status: "loading", lanes: [], columns: [], current: false });
let editing = $state(false);
let conflict = $state<string | undefined>();
let runner: KanbanQueryRunner | undefined;
let queryEditor = $state<SqlEditorHandle | undefined>();
let operations: KanbanCardOperationController | undefined;
let operationState = $state<KanbanCardOperationState>("idle");
let operationMessage = $state<string | undefined>();
let editingCard = $state<{ sourceKind?: string; sourceId: string; field: string; value: string; } | undefined>();
let dragged = $state<{ card: KanbanCard; source: string | null; } | undefined>();
let committingDrop = false;
// svelte-ignore state_referenced_locally
const session = createTableEngineSession({ projectDoc, projectId });

function copy(settings: KanbanSettings): KanbanSettings {
    return { ...settings, detailFields: [...settings.detailFields], laneOrder: [...settings.laneOrder] };
}
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function refresh() {
    const next = getKanban(projectDoc, kanban.kanbanId);
    if (next) committed = copy(next);
}
const observer = () => { operations?.invalidateDefinition(); refresh(); };
function beginEdit() { baseline = copy(committed); draft = copy(committed); queryDraft = committed.query; conflict = undefined; editing = true; }
function cancel() { draft = copy(committed); queryDraft = committed.query; conflict = undefined; editing = false; }
function apply() {
    if (isReadOnly) { conflict = "This presentation is read-only."; return; }
    const current = getKanban(projectDoc, kanban.kanbanId);
    if (!current) { conflict = "This Kanban was deleted or replaced. Your draft was preserved."; return; }
    // Monaco owns its buffer imperatively. Read it at the form's commit
    // boundary so Apply cannot race a pending Svelte callback or editor blur.
    queryDraft = queryEditor?.getValue() ?? queryDraft;
    const candidate = { ...draft, query: queryDraft };
    const keys = ["name", "query", "groupField", "titleField", "detailFields", "laneOrder"] as const;
    const dirty = keys.filter(key => !same(candidate[key], baseline[key]));
    const stale = dirty.filter(key => !same(current[key], baseline[key]));
    if (stale.length) { conflict = `A peer changed ${stale.join(", ")}. Your draft was not saved.`; return; }
    const updates = Object.fromEntries(dirty.map(key => [key, candidate[key] ?? ""]));
    updateKanban(projectDoc, kanban.kanbanId, updates);
    refresh(); editing = false; conflict = undefined;
}
function laneLabel(value: string | null): string {
    if (value === null) return "SQL NULL";
    if (value === "") return "Empty string";
    if (/^\s+$/.test(value)) return `Whitespace (${value.length})`;
    return value;
}
function laneKindLabel(value: string | null): string {
    if (value === null) return "SQL NULL value";
    if (value === "") return "Empty string value";
    return "Text value";
}
function display(value: unknown): string { return value === null ? "NULL" : value === undefined ? "" : String(value); }

function fieldValue(text: string, field: string): TableRecordValue | undefined {
    const column = runner?.sourceSchema?.columns.find(candidate => candidate.name === field);
    if (!column) return undefined;
    if (column.kind === "integer" || column.kind === "number") {
        const value = Number(text);
        return text.trim() && Number.isFinite(value) ? value : undefined;
    }
    if (column.kind === "boolean") return text === "true" ? true : text === "false" ? false : undefined;
    return text;
}
function beginFieldEdit(card: KanbanCard, field: string) {
    if (!operations?.begin(card, field)) return;
    if (!card.sourceIdentity) return;
    editingCard = {
        sourceKind: card.sourceIdentity.kind,
        sourceId: card.sourceIdentity.id,
        field,
        value: display(card.row[field]),
    };
}
function isEditing(card: KanbanCard, field: string): boolean {
    return editingCard?.field === field
        && editingCard.sourceId === card.sourceIdentity?.id
        && editingCard.sourceKind === card.sourceIdentity?.kind;
}
async function commitFieldEdit() {
    if (!editingCard || !operations) return;
    const value = fieldValue(editingCard.value, editingCard.field);
    if (value === undefined) { operationState = "refused"; operationMessage = "The value is invalid for this field."; return; }
    const result = await operations.commit(value);
    if (result.ok) editingCard = undefined;
}
function beginDrag(event: DragEvent, card: KanbanCard, source: string | null) {
    event.stopPropagation();
    if (!committed.groupField || !operations?.begin(card, committed.groupField)) { event.preventDefault(); return; }
    dragged = { card, source };
    event.dataTransfer?.setData("application/x-outliner-kanban-card", `${kanban.kanbanId}:${card.occurrenceKey}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
async function dropCard(event: DragEvent, destination: string | null) {
    event.preventDefault(); event.stopPropagation();
    if (!dragged || !operations || Object.is(dragged.source, destination)) { operations?.cancel(); dragged = undefined; return; }
    if (!operations.chooseDestination(destination)) { dragged = undefined; return; }
    committingDrop = true;
    const result = await operations.commit(destination);
    committingDrop = false;
    dragged = undefined;
    if (!result.ok) event.dataTransfer!.dropEffect = "none";
}
function endDrag() { if (!committingDrop) operations?.cancel(); dragged = undefined; }
function ownInput(event: Event) { event.stopPropagation(); }

onMount(() => {
    retainKanbanUndoManager(kanban.entry);
    kanban.entry.observeDeep(observer);
    void session.acquire(committed.sourceTableId).then(acquired => {
        if (!acquired) { projection = { status: "unavailable", lanes: [], columns: [], current: false, message: "Kanban source Table is missing" }; return; }
        runner = new KanbanQueryRunner({ projectDoc, kanbanId: kanban.kanbanId, kanban, sourceAdapter: acquired.adapter });
        operations = new KanbanCardOperationController({
            resolver: session,
            schema: () => runner?.sourceSchema,
            settings: () => getKanban(projectDoc, kanban.kanbanId),
            projection: () => projection,
            canWrite: () => !isReadOnly && Boolean(projectDoc),
            beginHistoryAction: () => globalUndoRouter.stopCapturing(),
            onState: (state, message) => { operationState = state; operationMessage = message; },
        });
        runner.subscribeProjection(value => {
            projection = value;
            operations?.observeProjection(value);
        });
        runner.start();
    });
});
onDestroy(() => { operations?.cancel(); kanban.entry.unobserveDeep(observer); runner?.dispose(); session.dispose(); destroyKanbanUndoManager(kanban.entry); });
</script>

<div class="kanban" data-testid="kanban-board" data-kanban-id={kanban.kanbanId}
    data-block-dnd-owner="kanban" data-block-dnd-type="application/x-outliner-kanban-card">
    <div class="toolbar">
        <button type="button" onclick={() => editing ? cancel() : beginEdit()}>{editing ? "Cancel" : "Configure"}</button>
    </div>
    {#if editing}
        <section class="editor" data-testid="kanban-config">
            <label>Name <input bind:value={draft.name} disabled={isReadOnly} /></label>
            <div class="editor-field">
                <span>SELECT query</span>
                <SqlEditor
                    bind:this={queryEditor}
                    bind:value={queryDraft}
                    readOnly={isReadOnly}
                    ariaLabel="Kanban SELECT query"
                    testId="kanban-query-editor"
                    onChange={value => queryDraft = value}
                    onBlur={value => queryDraft = value}
                />
            </div>
            <label>Grouping column <input bind:value={draft.groupField} list="kanban-columns" disabled={isReadOnly} /></label>
            <label>Title column <input bind:value={draft.titleField} list="kanban-columns" disabled={isReadOnly} /></label>
            <label>Detail columns (one per line)<textarea value={draft.detailFields.join("\n")} oninput={e => draft.detailFields = e.currentTarget.value.split("\n").filter(Boolean)} disabled={isReadOnly}></textarea></label>
            <label>Lane preference (one per line; &lt;NULL&gt; for SQL NULL)<textarea value={draft.laneOrder.map(v => v === null ? "<NULL>" : v).join("\n")} oninput={e => draft.laneOrder = e.currentTarget.value.split("\n").filter(v => v !== "").map(v => v === "<NULL>" ? null : v)} disabled={isReadOnly}></textarea></label>
            <datalist id="kanban-columns">{#each projection.columns as column (column)}<option value={column}></option>{/each}</datalist>
            {#if conflict}<p class="error" role="alert" data-testid="kanban-draft-conflict">{conflict}</p>{/if}
            <button type="button" onclick={apply} disabled={isReadOnly}>Apply</button>
            <button type="button" onclick={cancel}>Cancel</button>
        </section>
    {/if}
    {#if projection.status === "loading"}
        <p role="status">Loading board…</p>
    {:else if projection.status !== "success"}
        <p class="diagnostic" role="alert" data-testid={`kanban-${projection.status}`}>{projection.message ?? "Board unavailable"}</p>
    {:else if !projection.current}
        <p class="diagnostic" role="status">Showing a non-current result while the board refreshes.</p>
    {:else if projection.lanes.every(lane => lane.cards.length === 0)}
        <p data-testid="kanban-empty">The query returned no cards.</p>
    {:else}
        {#if operationState === "pending"}<p role="status">Card change pending…</p>{/if}
        {#if operationMessage}<p class="error" role="alert" data-testid="kanban-operation-message">{operationMessage}</p>{/if}
        <div class="lanes" data-testid="kanban-lanes">
            {#each projection.lanes as lane, laneIndex (`${lane.key === null ? "null" : `string:${lane.key}`}:${laneIndex}`)}
                <section class="lane" role="list" data-lane-kind={lane.key === null ? "null" : lane.key === "" ? "empty" : "string"}
                    ondragover={event => { if (dragged) { event.preventDefault(); event.stopPropagation(); } }}
                    ondrop={event => dropCard(event, lane.key)}>
                    <h2><span>{laneLabel(lane.key)}</span><span class="lane-kind">{laneKindLabel(lane.key)}</span></h2>
                    {#each lane.cards as card (card.occurrenceKey)}
                        <article class="card" data-card-occurrence={card.occurrenceKey}>
                            <button class="drag-handle" type="button" draggable={!isReadOnly} aria-label="Move card"
                                ondragstart={event => beginDrag(event, card, lane.key)} ondragend={endDrag}>↕</button>
                            {#if committed.titleField}
                                <h3 class="card-field title-field">
                                    {#if isEditing(card, committed.titleField) && editingCard}
                                        <input aria-label={`Edit ${committed.titleField}`} bind:value={editingCard.value} onkeydown={event => { if (event.key === "Enter") void commitFieldEdit(); if (event.key === "Escape") { operations?.cancel(); editingCard = undefined; } }} onpointerdown={ownInput} onclick={ownInput} />
                                        <button type="button" onclick={() => void commitFieldEdit()}>Save</button>
                                    {:else}
                                        <button class="field-value" type="button" aria-label={`Edit ${committed.titleField}`} disabled={isReadOnly} onclick={() => beginFieldEdit(card, committed.titleField!)}>{display(card.row[committed.titleField]) || "Untitled"}</button>
                                    {/if}
                                </h3>
                            {:else}<h3>Untitled</h3>{/if}
                            {#each committed.detailFields as field (field)}
                                <div class="detail"><strong>{field}</strong>:
                                    {#if isEditing(card, field) && editingCard}
                                        <input bind:value={editingCard.value} onkeydown={event => { if (event.key === "Enter") void commitFieldEdit(); if (event.key === "Escape") { operations?.cancel(); editingCard = undefined; } }} onpointerdown={ownInput} onclick={ownInput} />
                                        <button type="button" onclick={() => void commitFieldEdit()}>Save</button>
                                    {:else}
                                        <button class="field-value" type="button" disabled={isReadOnly} onclick={() => beginFieldEdit(card, field)}>{display(card.row[field])}</button>
                                    {/if}
                                </div>
                            {/each}
                        </article>
                    {/each}
                </section>
            {/each}
        </div>
    {/if}
</div>

<style>
.toolbar{display:flex;justify-content:flex-end;margin-bottom:.75rem}.editor{display:grid;gap:.75rem;border:1px solid #d1d5db;padding:1rem;margin-bottom:1rem}.editor label,.editor-field{display:grid;gap:.25rem}.editor textarea,.editor input{border:1px solid #9ca3af;border-radius:.25rem;padding:.45rem}.error,.diagnostic{color:#991b1b}.lanes{display:flex;gap:1rem;overflow-x:auto;align-items:flex-start}.lane{min-width:16rem;max-width:22rem;background:#f3f4f6;border-radius:.5rem;padding:.75rem}.lane h2{font-weight:700;margin-bottom:.5rem;display:flex;gap:.4rem;align-items:center}.lane-kind{font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:.1rem .3rem;border:1px solid #64748b;border-radius:.25rem;background:#fff;color:#334155}.card{background:white;border:1px solid #d1d5db;border-radius:.4rem;padding:.65rem;margin:.5rem 0;overflow-wrap:anywhere}.card h3{font-weight:600}.detail{font-size:.85rem;color:#4b5563}.drag-handle{float:right;cursor:grab;touch-action:none}.card-field{display:flex;align-items:center;gap:.35rem}.title-field{font-weight:600}.field-value{background:transparent;text-align:left;padding:0;border:0}.card input{min-width:0;border:1px solid #9ca3af;border-radius:.2rem;padding:.2rem}
</style>
