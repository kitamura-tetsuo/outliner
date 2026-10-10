<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type * as Y from "yjs";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import {
    destroyKanbanUndoManager,
    getKanban,
    getKanbanRegistry,
    retainKanbanUndoManager,
    type KanbanHandles,
    type KanbanSettings,
    updateKanban,
} from "../../services/yjstable/kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "../../services/yjstable/kanbanQueryRunner";
import SqlEditor from "../yjstable/SqlEditor.svelte";

interface Props { projectDoc: Y.Doc; projectId?: string; kanban: KanbanHandles; isReadOnly?: boolean; }
let { projectDoc, projectId, kanban, isReadOnly = false }: Props = $props();
// Props are immutable for this mounted lifetime: the parent keys by identity.
// svelte-ignore state_referenced_locally
let committed = $state<KanbanSettings>(getKanban(projectDoc, kanban.kanbanId)!);
// svelte-ignore state_referenced_locally
let draft = $state<KanbanSettings>({ ...committed, detailFields: [...committed.detailFields], laneOrder: [...committed.laneOrder] });
// svelte-ignore state_referenced_locally
let baseline = $state<KanbanSettings>({ ...draft, detailFields: [...draft.detailFields], laneOrder: [...draft.laneOrder] });
let projection = $state<KanbanProjection>({ status: "loading", lanes: [], columns: [], current: false });
let editing = $state(false);
let conflict = $state<string | undefined>();
let runner: KanbanQueryRunner | undefined;
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
const observer = () => refresh();
function beginEdit() { baseline = copy(committed); draft = copy(committed); conflict = undefined; editing = true; }
function cancel() { draft = copy(committed); conflict = undefined; editing = false; }
function apply() {
    if (isReadOnly) { conflict = "This presentation is read-only."; return; }
    const current = getKanban(projectDoc, kanban.kanbanId);
    if (!current) { conflict = "This Kanban was deleted or replaced. Your draft was preserved."; return; }
    const keys = ["name", "query", "groupField", "titleField", "detailFields", "laneOrder"] as const;
    const dirty = keys.filter(key => !same(draft[key], baseline[key]));
    const stale = dirty.filter(key => !same(current[key], baseline[key]));
    if (stale.length) { conflict = `A peer changed ${stale.join(", ")}. Your draft was not saved.`; return; }
    const updates = Object.fromEntries(dirty.map(key => [key, draft[key] ?? ""]));
    updateKanban(projectDoc, kanban.kanbanId, updates);
    refresh(); editing = false; conflict = undefined;
}
function laneLabel(value: string | null): string {
    if (value === null) return "SQL NULL";
    if (value === "") return "Empty string";
    if (/^\s+$/.test(value)) return `Whitespace (${value.length})`;
    return value;
}
function display(value: unknown): string { return value === null ? "NULL" : value === undefined ? "" : String(value); }

onMount(() => {
    retainKanbanUndoManager(kanban.entry);
    kanban.entry.observeDeep(observer);
    void session.acquire(committed.sourceTableId).then(acquired => {
        if (!acquired) { projection = { status: "unavailable", lanes: [], columns: [], current: false, message: "Kanban source Table is missing" }; return; }
        runner = new KanbanQueryRunner({ projectDoc, projectId, kanbanId: kanban.kanbanId, kanban, sourceAdapter: acquired.adapter });
        runner.subscribeProjection(value => projection = value);
        runner.start();
    });
});
onDestroy(() => { kanban.entry.unobserveDeep(observer); runner?.dispose(); session.dispose(); destroyKanbanUndoManager(kanban.entry); });
</script>

<div class="kanban" data-testid="kanban-board" data-kanban-id={kanban.kanbanId}>
    <div class="toolbar">
        <button type="button" onclick={() => editing ? cancel() : beginEdit()}>{editing ? "Cancel" : "Configure"}</button>
    </div>
    {#if editing}
        <section class="editor" data-testid="kanban-config">
            <label>Name <input bind:value={draft.name} disabled={isReadOnly} /></label>
            <label>SELECT query
                <SqlEditor
                    value={draft.query}
                    readOnly={isReadOnly}
                    ariaLabel="Kanban SELECT query"
                    testId="kanban-query-editor"
                    onChange={value => draft.query = value}
                />
            </label>
            <label>Grouping column <input bind:value={draft.groupField} list="kanban-columns" disabled={isReadOnly} /></label>
            <label>Title column <input bind:value={draft.titleField} list="kanban-columns" disabled={isReadOnly} /></label>
            <label>Detail columns (one per line)<textarea value={draft.detailFields.join("\n")} oninput={e => draft.detailFields = e.currentTarget.value.split("\n").filter(Boolean)} disabled={isReadOnly}></textarea></label>
            <label>Lane preference (one per line; &lt;NULL&gt; for SQL NULL)<textarea value={draft.laneOrder.map(v => v === null ? "<NULL>" : v).join("\n")} oninput={e => draft.laneOrder = e.currentTarget.value.split("\n").filter(v => v !== "").map(v => v === "<NULL>" ? null : v)} disabled={isReadOnly}></textarea></label>
            <datalist id="kanban-columns">{#each projection.columns as column}<option value={column}></option>{/each}</datalist>
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
        <div class="lanes" data-testid="kanban-lanes">
            {#each projection.lanes as lane, laneIndex (`${lane.key === null ? "null" : `string:${lane.key}`}:${laneIndex}`)}
                <section class="lane" data-lane-kind={lane.key === null ? "null" : lane.key === "" ? "empty" : "string"}>
                    <h2>{laneLabel(lane.key)}</h2>
                    {#each lane.cards as card (card.occurrenceKey)}
                        <article class="card">
                            <h3>{display(committed.titleField ? card.row[committed.titleField] : undefined) || "Untitled"}</h3>
                            {#each committed.detailFields as field}
                                <div class="detail"><strong>{field}</strong>: {display(card.row[field])}</div>
                            {/each}
                        </article>
                    {/each}
                </section>
            {/each}
        </div>
    {/if}
</div>

<style>
.toolbar{display:flex;justify-content:flex-end;margin-bottom:.75rem}.editor{display:grid;gap:.75rem;border:1px solid #d1d5db;padding:1rem;margin-bottom:1rem}.editor label{display:grid;gap:.25rem}.editor textarea,.editor input{border:1px solid #9ca3af;border-radius:.25rem;padding:.45rem}.error,.diagnostic{color:#991b1b}.lanes{display:flex;gap:1rem;overflow-x:auto;align-items:flex-start}.lane{min-width:16rem;max-width:22rem;background:#f3f4f6;border-radius:.5rem;padding:.75rem}.lane h2{font-weight:700;margin-bottom:.5rem}.card{background:white;border:1px solid #d1d5db;border-radius:.4rem;padding:.65rem;margin:.5rem 0;overflow-wrap:anywhere}.card h3{font-weight:600}.detail{font-size:.85rem;color:#4b5563}
</style>
