<script lang="ts">
import { onDestroy } from "svelte";
import type * as Y from "yjs";
import SqlEditor from "./SqlEditor.svelte";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import type {
    CatalogRuntimeState,
    SqlCatalogRuntimePort,
} from "../../services/yjstable/catalogRuntime";
import {
    applyCatalogMutation,
    catalogKindLabel,
    fetchCatalogSnapshot,
    isExecutableEnumSource,
    resolveCatalogTypeName,
    SqlCatalogTransportError,
    validateCatalogMutation,
    type SqlCatalogObjectDto,
    type SqlCatalogSnapshotDto,
} from "../../services/yjstable/sqlCatalogClient";
import {
    captureAppliedTransportEdit,
    createTransportCatalogReplayService,
} from "../../services/yjstable/sqlCatalogHistory";

interface Props {
    /** Stable project id used by project-owned rooms. */
    projectId: string;
    /**
     * Live project document. When provided (and no explicit `runtimePort`
     * is given), the panel subscribes to the project's actual catalog
     * runtime and Rebuild runtime requests a real rebuild.
     */
    projectDoc?: Y.Doc;
    /** Explicit runtime source; used by tests to drive the real boundary. */
    runtimePort?: SqlCatalogRuntimePort;
}

let { projectId, projectDoc = undefined, runtimePort = undefined }: Props = $props();

let snapshot = $state<SqlCatalogSnapshotDto | undefined>(undefined);
let loading = $state(true);
let loadError = $state<string | undefined>(undefined);
let selectedId = $state<string | undefined>(undefined);
let creating = $state(false);
let editing = $state(false);
let draft = $state("");
let draftId = $state("");
// The source revision observed when the draft started. Apply submits this
// revision — never the live snapshot revision — so a remote change that
// lands while a draft exists is refused as stale instead of silently
// rebasing the expected revision.
let draftRevision = $state<string | undefined>(undefined);
let draftBaseSource = $state<string | undefined>(undefined);
let busy = $state(false);
let validating = $state(false);
let validation = $state<{ kind: "preview" | "refused"; text: string; draft: string; revision: string; } | undefined>(
    undefined,
);
let conflict = $state<string | undefined>(undefined);
let commitInfo = $state<{ objectId: string; revision: string; } | undefined>(undefined);
let unconfirmed = $state<string | undefined>(undefined);
let runtime = $state<
    { status: "idle" | "building" | "ready" | "error"; revision?: string; message?: string; }
>({ status: "idle" });
// The connected runtime source behind `runtime`, if any. Readiness is only
// ever assigned from states this source publishes; without a source the
// panel stays idle and never claims ready.
let activePort = $state<SqlCatalogRuntimePort | undefined>(undefined);
let mutationError = $state<string | undefined>(undefined);
let mutationInfo = $state<string | undefined>(undefined);
let confirmDelete = $state(false);
let destroyed = false;

onDestroy(() => {
    destroyed = true;
});

const selected = $derived(snapshot?.objects.find(object => object.id === selectedId));
const hasDraft = $derived(creating || editing);
const draftModified = $derived(
    !hasDraft ? false : creating ? draft.length > 0 : draft !== draftBaseSource,
);
// The draft is local-only state: its exact SQL is preserved verbatim until
// Cancel discards it or a confirmed apply commits it. It is never written
// into the persisted list, the history router, or the runtime.
const draftStatus = $derived(
    !hasDraft
        ? "No unsaved draft."
        : draftModified
        ? `Unsaved draft (observed ${shortRevision(draftRevision)}). Not applied.`
        : `Unsaved draft opened (observed ${shortRevision(draftRevision)}). No changes typed yet; nothing applied.`,
);
// A validation result belongs to one exact draft text and observed revision.
// Editing the draft after validating leaves the previous result visible but
// explicitly stale so it can never enable success for newer input.
const validationStale = $derived(
    validation !== undefined && (validation.draft !== draft || validation.revision !== draftRevision),
);

function shortRevision(revision: string | undefined): string {
    return revision === undefined ? "unknown" : revision.slice(0, 12);
}

function describeRefusal(result: { reason?: unknown; diagnostics?: { message?: unknown; objectId?: unknown; }[]; }): string {
    const details = (result.diagnostics ?? [])
        .map(diagnostic => {
            const message = typeof diagnostic.message === "string" ? diagnostic.message : undefined;
            const objectId = typeof diagnostic.objectId === "string" ? diagnostic.objectId : undefined;
            if (!message) return undefined;
            return objectId ? `${objectId}: ${message}` : message;
        })
        .filter((message): message is string => message !== undefined);
    const reason = typeof result.reason === "string" ? result.reason : "refused";
    return `Refused (${reason})${details.length > 0 ? `: ${details.join("; ")}` : ""}.`;
}

function describeRuntime(): string {
    if (runtime.status === "idle") return "Runtime has not built yet.";
    if (runtime.status === "building") {
        return `Runtime building for persisted revision ${shortRevision(runtime.revision)}… Not ready.`;
    }
    if (runtime.status === "ready") {
        const qualifier = hasDraft ? " Covers persisted source only, not the unsaved draft." : "";
        return `Runtime ready for persisted revision ${shortRevision(runtime.revision)}.${qualifier}`;
    }
    return `Runtime error for persisted revision ${shortRevision(runtime.revision)}: ${runtime.message ?? "unknown"}.`;
}

function applyRuntimeState(state: CatalogRuntimeState): void {
    // Runtime readiness reflects a successful installation of the
    // corresponding persisted inputs: pending builds stay building and
    // failed builds surface error diagnostics. No other path assigns ready.
    if (state.status === "building") {
        runtime = { status: "building", revision: state.revision };
    } else if (state.status === "ready") {
        runtime = { status: "ready", revision: state.snapshot.revision };
    } else {
        runtime = { status: "error", revision: state.revision, message: state.message };
    }
}

function refreshConflict(next: SqlCatalogSnapshotDto): void {
    if (!hasDraft || !draftRevision) return;
    if (next.revision === draftRevision) {
        // The revision is unchanged but the target object itself may have
        // been replaced under the same revision window; re-check identity.
        if (editing && selectedId && !next.objects.some(object => object.id === selectedId)) {
            conflict =
                `Conflict: the edited declaration was removed remotely (observed ${shortRevision(draftRevision)}). Draft preserved locally; nothing was overwritten.`;
        }
        return;
    }
    conflict =
        `Conflict: source changed remotely (observed ${shortRevision(draftRevision)}, now ${
            shortRevision(next.revision)
        }). Draft preserved locally; Apply will be refused as stale until the draft is rebased.`;
}
// History availability tracks the shared router so the panel's Undo/Redo
// behave exactly like the toolbar and Ctrl+Z / Ctrl+Shift+Z.
const canUndoHistory = $derived(globalUndoRouter.canUndo());
const canRedoHistory = $derived(globalUndoRouter.canRedo());
const historyPending = $derived(globalUndoRouter.isPending);
const historyOutcome = $derived(globalUndoRouter.lastAsyncOutcome);

function isActiveProject(value: string): boolean {
    return !destroyed && value === projectId;
}

function appliedObjectId(result: unknown): string | undefined {
    if (!result || typeof result !== "object") return undefined;
    const record = result as { status?: unknown; objectIds?: unknown; };
    if (record.status !== "applied") return undefined;
    if (!Array.isArray(record.objectIds) || record.objectIds.length !== 1) return undefined;
    const id = record.objectIds[0];
    return typeof id === "string" ? id : undefined;
}

function captureWhenApplied(before: SqlCatalogSnapshotDto, result: unknown, fallbackId: string) {
    const id = appliedObjectId(result) ?? fallbackId;
    const after = snapshot;
    if (!after) return;
    // The confirmed receipt carries the authoritative before/after snapshots:
    // capture prefers them over this display refresh, so a failed refresh
    // still registers exactly one step and a concurrent peer edit is never
    // absorbed into this user's step.
    captureAppliedTransportEdit(
        globalUndoRouter,
        before,
        after,
        id,
        createTransportCatalogReplayService(projectId),
        isActiveProject,
        result,
    );
}

function describeError(error: unknown): string {
    if (error instanceof SqlCatalogTransportError) {
        if (error.status === 401) return "Not authenticated. Sign in to manage SQL types.";
        if (error.status === 403) return "Access denied: this project is not shared with you.";
        return error.message;
    }
    return error instanceof Error ? error.message : String(error);
}

function describeApplyFailure(error: unknown): string {
    // Offline drafting stays local: an unavailable authenticated apply is an
    // explicit unconfirmed failure, never a queued implicit write. Only the
    // server's confirmed receipt advances history; the draft is preserved.
    if (error instanceof SqlCatalogTransportError) return describeError(error);
    const detail = error instanceof Error ? error.message : String(error);
    return `Not confirmed: ${detail}. Draft preserved locally; nothing was queued. Reload and retry.`;
}

function describeHistoryOutcome(): string | undefined {
    if (historyPending) return "History replay pending confirmation…";
    if (!historyOutcome) return undefined;
    if (historyOutcome.status === "applied") return "History replay confirmed.";
    return `History ${historyOutcome.status}: ${historyOutcome.reason}`;
}

const historyStatus = $derived(describeHistoryOutcome());

function describeResult(result: unknown): string | undefined {
    if (!result || typeof result !== "object") return undefined;
    const status = (result as { status?: unknown; }).status;
    if (status === "applied") return "Saved.";
    if (status === "no-op") return "No changes to save.";
    if (status === "refused") {
        const refusal = result as { reason?: unknown; diagnostics?: { message?: unknown; objectId?: unknown; }[]; };
        const details = (refusal.diagnostics ?? [])
            .map(diagnostic => {
                const message = typeof diagnostic.message === "string" ? diagnostic.message : undefined;
                const objectId = typeof diagnostic.objectId === "string" ? diagnostic.objectId : undefined;
                if (!message) return undefined;
                return objectId ? `${objectId}: ${message}` : message;
            })
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
        const next = await fetchCatalogSnapshot(projectId);
        // Reload reads persisted source only. The local draft is preserved
        // verbatim and never merged into the list; a remotely removed
        // selection clears the detail view but keeps the draft text.
        snapshot = next;
        if (selectedId && !next.objects.some(object => object.id === selectedId)) selectedId = undefined;
        refreshConflict(next);
        // Reload reads persisted source only and never moves the runtime by
        // itself: readiness arrives exclusively through the subscribed
        // runtime source once it installs a revision.
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
    validation = undefined;
    conflict = undefined;
    unconfirmed = undefined;
    draftId = crypto.randomUUID();
    draft = "CREATE TYPE new_type AS ENUM ('value1', 'value2');";
    draftRevision = snapshot?.revision;
    draftBaseSource = undefined;
    selectedId = undefined;
}

function inspect(object: SqlCatalogObjectDto) {
    creating = false;
    editing = false;
    confirmDelete = false;
    mutationError = undefined;
    mutationInfo = undefined;
    validation = undefined;
    conflict = undefined;
    unconfirmed = undefined;
    draftRevision = undefined;
    draftBaseSource = undefined;
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
    validation = undefined;
    conflict = undefined;
    unconfirmed = undefined;
    draftId = current.id;
    draft = current.source;
    draftRevision = snapshot?.revision;
    draftBaseSource = current.source;
}

function cancel() {
    // Cancel discards only the local draft: persisted source, history and the
    // runtime are untouched.
    creating = false;
    editing = false;
    confirmDelete = false;
    mutationError = undefined;
    mutationInfo = undefined;
    validation = undefined;
    conflict = undefined;
    unconfirmed = undefined;
    draftRevision = undefined;
    draftBaseSource = undefined;
    if (!selectedId) draft = "";
}

function handleDraftChange(next: string) {
    draft = next;
}

function rebuildRuntime() {
    // Rebuild requests a real rebuild from the connected runtime source and
    // reports nothing by itself: readiness (or error diagnostics) arrives
    // only through the subscription. Without a connected source there is no
    // runtime to rebuild, so the panel never claims readiness.
    if (!snapshot || busy || validating) return;
    activePort?.rebuild();
}

function buildDraftIntent(): { operation: "create" | "replace"; object: SqlCatalogObjectDto; } | undefined {
    if (creating) return { operation: "create", object: { id: draftId, kind: "enum", source: draft } };
    if (editing && selected) {
        return { operation: "replace", object: { id: selected.id, kind: "enum", source: draft } };
    }
    return undefined;
}

async function submitValidate() {
    if (!snapshot) return;
    const intent = buildDraftIntent();
    if (!intent) return;
    const observedRevision = draftRevision ?? snapshot.revision;
    // The request validates exactly this text. Edits typed while it is in
    // flight must not inherit its outcome: the result below is recorded
    // against the submitted text, so newer input renders it stale.
    const submittedDraft = draft;
    validating = true;
    mutationError = undefined;
    try {
        const result = await validateCatalogMutation(projectId, { expectedRevision: observedRevision, intent });
        const record = (result ?? {}) as { status?: unknown; reason?: unknown; diagnostics?: { message?: unknown; objectId?: unknown; }[]; };
        if (record.status === "preview") {
            validation = {
                kind: "preview",
                text: "Valid preview for the submitted draft. Not applied: source, history and runtime are unchanged.",
                draft: submittedDraft,
                revision: observedRevision,
            };
        } else if (record.status === "refused") {
            const text = describeRefusal(record);
            validation = { kind: "refused", text, draft: submittedDraft, revision: observedRevision };
            if (record.reason === "stale") {
                conflict =
                    `Conflict: the draft was validated against observed ${shortRevision(observedRevision)}, which is stale. Draft preserved locally; nothing was overwritten.`;
            }
        } else if (record.status === "unconfirmed") {
            const reason = typeof record.reason === "string" ? record.reason : "unknown";
            unconfirmed = `Validation not confirmed: ${reason}. No success recorded; draft preserved.`;
        } else {
            unconfirmed = "Validation not confirmed: unknown receipt. No success recorded; draft preserved.";
        }
    } catch (error) {
        mutationError = describeError(error);
    } finally {
        validating = false;
    }
}

function noteStaleConflict(result: unknown): boolean {
    const record = (result ?? {}) as { status?: unknown; reason?: unknown; };
    if (record.status === "refused" && record.reason === "stale") {
        conflict =
            `Conflict: source changed remotely (observed ${shortRevision(draftRevision)}). Draft preserved locally; Apply was refused as stale and nothing was overwritten.`;
        return true;
    }
    if (record.status === "unconfirmed" && record.reason === "stale") {
        conflict =
            `Conflict: source changed remotely (observed ${shortRevision(draftRevision)}). Draft preserved locally; Apply was refused as stale and nothing was overwritten.`;
        return true;
    }
    return false;
}

function noteUnconfirmedResult(result: unknown): boolean {
    const record = (result ?? {}) as { status?: unknown; reason?: unknown; };
    if (record.status !== "unconfirmed") return false;
    const reason = typeof record.reason === "string" ? record.reason : "unknown";
    unconfirmed =
        `Apply not confirmed (${reason}). No success recorded, no history step, no duplicate allocation; draft preserved. Reload and retry.`;
    if (reason === "stale") {
        conflict =
            `Conflict: source changed remotely (observed ${shortRevision(draftRevision)}). Draft preserved locally; Apply was refused as stale and nothing was overwritten.`;
    }
    return true;
}

function noteConfirmedCommit(objectId: string, result: unknown): void {
    const record = (result ?? {}) as { after?: { revision?: unknown; }; };
    const after = record.after as { revision?: unknown; } | undefined;
    const revision = after && typeof after.revision === "string" ? after.revision : snapshot?.revision;
    if (revision) {
        commitInfo = { objectId, revision };
        // The commit confirms source only. Runtime still needs its own
        // confirmed rebuild before it may report ready for this revision;
        // the subscribed source resolves this pending state. Without a
        // connected source nothing is building, so the panel stays idle
        // rather than claiming a build.
        if (activePort) {
            runtime = { status: "building", revision };
        }
    }
}

async function submitCreate() {
    if (!snapshot) return;
    const before = snapshot;
    const observedRevision = draftRevision ?? before.revision;
    // The request commits exactly this text. Edits accepted while it is
    // pending belong to a newer unsaved draft and must survive the confirmed
    // receipt verbatim instead of being cleared with the submitted text.
    const submitted = draft;
    const submittedId = draftId;
    busy = true;
    mutationError = undefined;
    mutationInfo = undefined;
    unconfirmed = undefined;
    try {
        const result = await applyCatalogMutation(projectId, {
            expectedRevision: observedRevision,
            intent: { operation: "create", object: { id: submittedId, kind: "enum", source: submitted } },
        });
        const summary = describeResult(result);
        if (noteUnconfirmedResult(result)) {
            mutationInfo = summary;
            mutationError = summary;
            return;
        }
        await load();
        // Only a confirmed effectful receipt registers exactly one history
        // step; previews, no-ops, refusals and unconfirmed results register
        // none. Disabled/read-only controls never substitute for this gate.
        if (appliedObjectId(result) !== undefined) captureWhenApplied(before, result, submittedId);
        if (summary === "Saved.") {
            noteConfirmedCommit(submittedId, result);
            if (draft !== submitted) {
                // Newer edits arrived while the request was pending: the
                // confirmed source holds only the submitted text, so the
                // current text stays an exact unsaved draft at its observed
                // revision. The refresh above already re-derived the
                // conflict; the submitted validation (if any) now reads
                // stale for the current text.
            } else {
                creating = false;
                selectedId = submittedId;
                draft = "";
                draftRevision = undefined;
                draftBaseSource = undefined;
                validation = undefined;
                conflict = undefined;
            }
        } else if (noteStaleConflict(result)) {
            // Draft preserved; expected revision stays at the observed value.
        }
        mutationInfo = summary;
        if (summary !== "Saved." && summary !== "No changes to save.") mutationError = summary;
    } catch (error) {
        unconfirmed = undefined;
        mutationError = describeApplyFailure(error);
        if (mutationError.startsWith("Not confirmed")) {
            unconfirmed = `${mutationError}`;
        }
    } finally {
        busy = false;
    }
}

async function submitEdit() {
    if (!snapshot || !selected) return;
    const before = snapshot;
    const targetId = selected.id;
    const observedRevision = draftRevision ?? before.revision;
    // Same pending-edit rule as creation: the request replaces with exactly
    // this text, and newer accepted edits must survive the receipt verbatim.
    const submitted = draft;
    busy = true;
    mutationError = undefined;
    mutationInfo = undefined;
    unconfirmed = undefined;
    try {
        const result = await applyCatalogMutation(projectId, {
            expectedRevision: observedRevision,
            intent: { operation: "replace", object: { id: targetId, kind: "enum", source: submitted } },
        });
        const summary = describeResult(result);
        if (noteUnconfirmedResult(result)) {
            mutationInfo = summary;
            mutationError = summary;
            return;
        }
        await load();
        if (appliedObjectId(result) !== undefined) captureWhenApplied(before, result, targetId);
        if (summary === "Saved." || summary === "No changes to save.") {
            if (draft !== submitted) {
                // Newer edits arrived while the request was pending: keep
                // them as the exact unsaved draft at the observed revision.
                // The refresh above already re-derived the conflict, and the
                // submitted validation (if any) now reads stale.
                if (summary === "Saved.") noteConfirmedCommit(targetId, result);
            } else {
                if (summary === "Saved.") noteConfirmedCommit(targetId, result);
                editing = false;
                draftRevision = undefined;
                draftBaseSource = undefined;
                validation = undefined;
                if (summary === "Saved.") conflict = undefined;
            }
        } else if (noteStaleConflict(result)) {
            // Draft preserved; expected revision stays at the observed value.
        }
        mutationInfo = summary;
        if (summary !== "Saved." && summary !== "No changes to save.") mutationError = summary;
    } catch (error) {
        unconfirmed = undefined;
        mutationError = describeApplyFailure(error);
        if (mutationError.startsWith("Not confirmed")) {
            unconfirmed = `${mutationError}`;
        }
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
    const before = snapshot;
    const targetId = selected.id;
    busy = true;
    mutationError = undefined;
    mutationInfo = undefined;
    unconfirmed = undefined;
    try {
        const result = await applyCatalogMutation(projectId, {
            expectedRevision: before.revision,
            intent: { operation: "delete", objectId: targetId },
        });
        const summary = describeResult(result);
        if (noteUnconfirmedResult(result)) {
            mutationInfo = summary;
            mutationError = summary;
            return;
        }
        await load();
        if (appliedObjectId(result) !== undefined) captureWhenApplied(before, result, targetId);
        if (summary === "Saved.") {
            noteConfirmedCommit(targetId, result);
            selectedId = undefined;
            editing = false;
            draft = "";
        }
        mutationInfo = summary;
        if (summary !== "Saved.") mutationError = summary;
    } catch (error) {
        unconfirmed = undefined;
        mutationError = describeApplyFailure(error);
        if (mutationError.startsWith("Not confirmed")) {
            unconfirmed = `${mutationError}`;
        }
    } finally {
        busy = false;
        confirmDelete = false;
    }
}

function handleHistoryUndo() {
    globalUndoRouter.undo();
}

function handleHistoryRedo() {
    globalUndoRouter.redo();
}

let observedProjectId = "";

$effect(() => {
    // Reload (and reconnect-remount) reads persisted source only: local
    // editor state is never used to repair missing persisted definitions.
    if (observedProjectId !== projectId) {
        observedProjectId = projectId;
        creating = false;
        editing = false;
        draft = "";
        draftRevision = undefined;
        draftBaseSource = undefined;
        validation = undefined;
        conflict = undefined;
        commitInfo = undefined;
        unconfirmed = undefined;
        runtime = { status: "idle" };
        selectedId = undefined;
    }
    void load();
});

$effect(() => {
    // Connect the runtime status to its production source. An explicit port
    // wins (tests); otherwise a live project document subscribes to the
    // project's actual catalog runtime. Readiness and error diagnostics
    // arrive exclusively through this subscription — neither the persisted
    // read above nor the rebuild button assigns them.
    const override = runtimePort;
    const doc = projectDoc;
    const pid = projectId;
    let port: SqlCatalogRuntimePort | undefined = override;
    let disposeSession: (() => void) | undefined;
    if (!port && doc) {
        const session = createTableEngineSession({ projectDoc: doc, projectId: pid });
        disposeSession = () => session.dispose();
        port = {
            subscribe: listener => session.subscribeCatalog(listener),
            rebuild: () => session.rebuildCatalog(),
        };
    }
    activePort = port;
    if (!port) {
        runtime = { status: "idle" };
        return;
    }
    const unsubscribe = port.subscribe(state => {
        if (!isActiveProject(pid)) return;
        applyRuntimeState(state);
    });
    return () => {
        unsubscribe();
        disposeSession?.();
    };
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
            <button
                type="button"
                data-testid="sql-catalog-undo"
                disabled={loading || busy || historyPending || !canUndoHistory}
                onclick={handleHistoryUndo}
                title="Undo (Ctrl+Z)"
            >
                Undo
            </button>
            <button
                type="button"
                data-testid="sql-catalog-redo"
                disabled={loading || busy || historyPending || !canRedoHistory}
                onclick={handleHistoryRedo}
                title="Redo (Ctrl+Shift+Z)"
            >
                Redo
            </button>
        </div>
    </div>

    {#if snapshot}
        <p class="revision" data-testid="sql-catalog-revision">Revision <code>{snapshot.revision.slice(0, 12)}</code></p>
    {/if}

    <section class="states" data-testid="sql-catalog-states" aria-label="Draft, validation, apply, commit and runtime states">
        <p class="state" data-testid="sql-catalog-draft-status">{draftStatus}</p>
        {#if conflict}
            <p class="warning" data-testid="sql-catalog-conflict">{conflict}</p>
        {/if}
        {#if validation && (creating || editing || validationStale)}
            <p
                class={validation.kind === "preview" ? "info" : "error"}
                data-testid="sql-catalog-validation"
            >
                {validation.kind === "preview" ? "Validation preview: " : "Validation refused: "}{validation.text}
                {#if validationStale}
                    <span data-testid="sql-catalog-validation-stale"> Stale for the current draft; re-validate before Apply.</span>
                {/if}
            </p>
        {/if}
        {#if busy}
            <p class="info" data-testid="sql-catalog-apply-status">
                Applying source for observed revision {shortRevision(draftRevision ?? snapshot?.revision)}… Not ready.
            </p>
        {/if}
        {#if commitInfo}
            <p class="info" data-testid="sql-catalog-commit-status">
                Source committed for {commitInfo.objectId.slice(0, 8)} at revision {shortRevision(commitInfo.revision)}.
                Runtime readiness needs a separate confirmed rebuild.
            </p>
        {/if}
        <div class="runtime-row">
            <p class="state" data-testid="sql-catalog-runtime-status">{describeRuntime()}</p>
            <button
                type="button"
                data-testid="sql-catalog-rebuild-runtime"
                disabled={loading || busy || validating || !snapshot || !activePort}
                title={!activePort ? "No SQL runtime connected." : undefined}
                onclick={rebuildRuntime}
            >
                Rebuild runtime
            </button>
        </div>
        {#if unconfirmed}
            <p class="error" data-testid="sql-catalog-unconfirmed">{unconfirmed}</p>
        {/if}
    </section>

    <section class="rules" data-testid="sql-catalog-first-release-rules" aria-label="First-release declarative rules">
        <h3>First-release declarative rules</h3>
        <ul>
            <li>Deleting or renaming a referenced type, or removing one of its labels, is refused before effects with a reference diagnostic; Table schemas, records and Grid/Calendar/Schedule queries are never mutated by the refusal.</li>
            <li>Creating ENUMs, adding labels and reordering labels never rewrite Table records; the catalog stores declarations only and performs no automatic data or reference migration.</li>
            <li>Arbitrary ALTER and DROP scripts are not performed here; only one unqualified CREATE TYPE AS ENUM declaration per object is executable.</li>
            <li>Cross-Project structural transfer requires a compatible pre-existing destination type and is refused rather than converted to TEXT.</li>
            <li>A stored declaration is not proof that all dependent SQL has rebuilt successfully; every read and write is re-authorized server-side and a denied grant or lost connection leaves the editor unconfirmed.</li>
        </ul>
    </section>

    {#if historyStatus}
        <p class="info" data-testid="sql-catalog-history-status">{historyStatus}</p>
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
                onChange={handleDraftChange}
            />
            <div class="editor-actions">
                <button
                    type="button"
                    data-testid="sql-catalog-validate"
                    disabled={busy || validating}
                    onclick={submitValidate}
                >
                    {validating ? "Validating…" : "Validate"}
                </button>
                <button type="button" data-testid="sql-catalog-create" disabled={busy || validating} onclick={submitCreate}>
                    {busy ? "Creating…" : "Create type"}
                </button>
                <button type="button" data-testid="sql-catalog-cancel" disabled={busy || validating} onclick={cancel}>
                    Cancel
                </button>
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
                    onChange={handleDraftChange}
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
                    <button
                        type="button"
                        data-testid="sql-catalog-validate"
                        disabled={busy || validating}
                        onclick={submitValidate}
                    >
                        {validating ? "Validating…" : "Validate"}
                    </button>
                    <button type="button" data-testid="sql-catalog-save" disabled={busy || validating} onclick={submitEdit}>
                        {busy ? "Saving…" : "Save changes"}
                    </button>
                    <button
                        type="button"
                        data-testid="sql-catalog-cancel"
                        disabled={busy || validating}
                        onclick={cancel}
                    >
                        Cancel
                    </button>
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

.rules {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    background: #f9fafb;
    padding: 8px 12px;
}

.rules h3 {
    margin: 0 0 4px;
    font-size: 0.85rem;
}

.rules ul {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.78rem;
    color: #4b5563;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.loading,
.empty,
.info {
    color: #6b7280;
    font-size: 0.85rem;
    margin: 0;
}

.states {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    background: #f9fafb;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.state {
    color: #374151;
    font-size: 0.8rem;
    margin: 0;
}

.warning {
    color: #b45309;
    font-size: 0.85rem;
    margin: 0;
}

.runtime-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}

.runtime-row button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 0.85rem;
}

.runtime-row button:disabled {
    opacity: 0.5;
    cursor: default;
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
