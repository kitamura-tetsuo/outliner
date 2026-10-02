import crypto from "crypto";
import * as Y from "yjs";
import type { DocumentStore } from "../persistence.js";
import { closeLiveRoom, type DirectConnection, isLiveRoom, type LiveRoomHost, openLiveRoom } from "./live-room.js";
import { McpReadError } from "./mcp-error.js";

/**
 * Revision-checked, field-scoped updates to an existing Grid's saved
 * presentation definition (issue #5435).
 *
 * A Grid is an entry of the project room's `yjsGrids` registry. Its
 * presentation is the Grid name, the stored column-order preference, the
 * per-column component settings (label, type, sparse `hidden`) keyed by SQL
 * result-column name, and the add-row / delete-confirmation flags. Every
 * placement of the Grid renders this one definition; another Grid over the
 * same Table has its own.
 *
 * Column settings are saved preferences keyed by exact result-column name.
 * They may be dormant while the query does not return that name, so nothing
 * here executes SQL, inspects a Table schema, or claims that a configured
 * column currently renders.
 *
 * `presentationRevision` is a content precondition over a detached
 * descriptor of the Grid's identity, source Table, saved query, and complete
 * presentation snapshot. It is not an edit counter: A -> B -> A restores the
 * original token. It deliberately excludes Table records/schema, other Grids,
 * Pages, placements, and other project metadata. The existing query-only
 * Grid revision (`get_grid` / `set_view_query`) is a different contract.
 *
 * An update validates the complete request, authorizes, opens the live
 * project room, then — after re-authorizing — reads the live definition,
 * compares the revision, plans the leaf changes, and applies them in one Yjs
 * transaction with no await in between. Only the changed top-level fields and
 * component leaves are written; the entry, its components container, and
 * existing per-column maps are never replaced. When persistence is configured
 * a confirmed apply is reported only once storage acknowledges the resulting
 * project state.
 *
 * Outcomes: every thrown McpReadError whose debug `effect` is "none" is a
 * confirmed no-effect refusal. An effect whose durable result cannot be
 * established is an `internal_failure` with `applied: null` and no resulting
 * revision (GridPresentationEffectError). A grant revoked after an effect
 * withholds the result (`forbidden`, GridPresentationUndisclosedError) but
 * keeps the established receipt on the error for internal use. Nothing is
 * ever compensated by restoring an earlier snapshot.
 */

export const GRID_PRESENTATION_REVISION_PREFIX = "grid-presentation-v1:";
export const GRID_COMPONENT_TYPES = ["text", "number", "checkbox", "select", "date"] as const;
export const MAX_GRID_PRESENTATION_COLUMNS = 100;
export const MAX_GRID_COLUMN_KEY_BYTES = 256;
export const MAX_GRID_TEXT_BYTES = 1024;
export const MAX_GRID_CHANGES_BYTES = 65536;
export const MAX_PRESENTATION_REVISION_LENGTH = 200;

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_KEYS = new Set(["projectId", "gridId", "expectedPresentationRevision", "changes", "dryRun"]);
const CHANGE_KEYS = new Set(["name", "columnOrder", "components", "showAddRowButton", "confirmRowDelete"]);
const COMPONENT_KEYS = new Set(["label", "type", "shown"]);
const MUTATION_ORIGIN = "grid-presentation-update";

export type GridComponentType = (typeof GRID_COMPONENT_TYPES)[number];

export interface GridComponentPresentation {
    label: string | null;
    type: string | null;
    shown: boolean;
}

export interface GridPresentation {
    name: string;
    columnOrder: string[];
    components: Record<string, GridComponentPresentation>;
    showAddRowButton: boolean;
    confirmRowDelete: boolean;
}

export interface GridPresentationRead {
    projectId: string;
    gridId: string;
    sourceTableId: string | null;
    query: string;
    presentationRevision: string;
    presentation: GridPresentation;
}

export interface GridComponentChange {
    label?: string | null;
    type?: GridComponentType | null;
    shown?: boolean;
}

export interface GridPresentationChanges {
    name?: string;
    columnOrder?: string[];
    components?: Record<string, GridComponentChange>;
    showAddRowButton?: boolean;
    confirmRowDelete?: boolean;
}

export interface UpdateGridPresentationRequest {
    projectId: string;
    gridId: string;
    expectedPresentationRevision: string;
    changes: GridPresentationChanges;
    dryRun?: boolean;
}

export interface GridPresentationPreview {
    dryRun: true;
    applied: false;
    projectId: string;
    gridId: string;
    presentation: GridPresentation;
    presentationRevision: string;
    priorPresentationRevision: string;
    candidatePresentation: GridPresentation;
    wouldChange: boolean;
}

export interface GridPresentationApplied {
    dryRun: false;
    /** Whether an actual configuration change occurred (false for an accepted canonical no-op). */
    applied: boolean;
    projectId: string;
    gridId: string;
    priorPresentationRevision: string;
    presentationRevision: string;
    presentation: GridPresentation;
}

export type GridPresentationUpdateResult = GridPresentationPreview | GridPresentationApplied;

/**
 * What an apply is known to have done once its mutation was attempted:
 * either a confirmed (and, with persistence, durably acknowledged) change,
 * or an effect whose complete or durable result could not be established.
 */
export type GridPresentationReceipt =
    | GridPresentationApplied & { status: "applied"; }
    | {
        status: "unknown";
        dryRun: false;
        applied: null;
        projectId: string;
        gridId: string;
        priorPresentationRevision: string;
        reason: string;
    };

/** An effect-bearing failure: the mutation may (or did) happen, but no confirmed result is reported. */
export class GridPresentationEffectError extends McpReadError {
    constructor(public readonly receipt: GridPresentationReceipt, message: string) {
        super("internal_failure", message, {
            effect: receipt.status,
            applied: receipt.applied,
            priorPresentationRevision: receipt.priorPresentationRevision,
            ...(receipt.status === "applied" ? { presentationRevision: receipt.presentationRevision } : {}),
            ...(receipt.status === "unknown" ? { reason: receipt.reason } : {}),
        });
    }
}

/**
 * Access was revoked after an authorized effect: the result is withheld from
 * the caller, but the established receipt is kept on the error for internal
 * bookkeeping. Never serialize `receipt` into a response.
 */
export class GridPresentationUndisclosedError extends McpReadError {
    constructor(public readonly receipt: GridPresentationReceipt) {
        super("forbidden", "Project is inaccessible", { effect: "undisclosed" });
    }
}

export interface GridPresentationUpdateOptions {
    /**
     * Awaited after the request is validated, authorized and the live room is
     * open, and before the final authorization, revision comparison and
     * write. Lets regression tests observe the contested boundary.
     */
    beforeMutation?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Snapshot and revision
// ---------------------------------------------------------------------------

function compareCodeUnits(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function optionalText(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    return typeof value === "string" ? value : String(value);
}

function storedOrder(entry: Y.Map<unknown>): string[] {
    const value = entry.get("columnOrder");
    const items = Array.isArray(value) ? value : value instanceof Y.Array ? value.toArray() : [];
    return items.filter((item): item is string => typeof item === "string");
}

function componentOf(value: unknown): GridComponentPresentation {
    if (!(value instanceof Y.Map)) return { label: null, type: null, shown: true };
    return {
        label: optionalText(value.get("label")),
        type: optionalText(value.get("type")),
        shown: value.get("hidden") !== true,
    };
}

/** Detached presentation snapshot of a live Grid entry. Never writes to the entry. */
export function readPresentationSnapshot(entry: Y.Map<unknown>): GridPresentation {
    const container = entry.get("components");
    const saved = new Map<string, unknown>(container instanceof Y.Map ? container.entries() : []);
    const columnOrder = storedOrder(entry);
    const names = [...new Set([...saved.keys(), ...columnOrder])].sort(compareCodeUnits);
    const name = entry.get("name");
    return {
        name: name === undefined || name === null ? "" : typeof name === "string" ? name : String(name),
        columnOrder,
        // Object.fromEntries defines own data properties, so literal keys
        // such as "__proto__" or "a.b" stay plain column names.
        components: Object.fromEntries(names.map(column => [column, componentOf(saved.get(column))])),
        showAddRowButton: entry.get("showAddRowButton") !== false,
        confirmRowDelete: entry.get("confirmRowDelete") === true,
    };
}

function readSourceTableId(entry: Y.Map<unknown>): string | null {
    const value = entry.get("sourceTableId");
    return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Versioned content token over the explicitly enumerated descriptor. The
 * descriptor is a fixed-position array (components sorted by code unit), so
 * the serialization is deterministic without any key sorting.
 */
export function gridPresentationRevision(descriptor: Omit<GridPresentationRead, "presentationRevision">): string {
    const { presentation } = descriptor;
    const canonical = [
        "grid-presentation-v1",
        descriptor.projectId,
        descriptor.gridId,
        descriptor.sourceTableId,
        descriptor.query,
        presentation.name,
        [...presentation.columnOrder],
        Object.entries(presentation.components)
            .sort(([a], [b]) => compareCodeUnits(a, b))
            .map(([column, component]) => [column, component.label, component.type, component.shown]),
        presentation.showAddRowButton,
        presentation.confirmRowDelete,
    ];
    const digest = crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
    return `${GRID_PRESENTATION_REVISION_PREFIX}${digest}`;
}

/** The complete REQ-001 read of one live Grid entry, with its revision. */
export function readGridPresentation(projectId: string, gridId: string, entry: Y.Map<unknown>): GridPresentationRead {
    const descriptor = {
        projectId,
        gridId,
        sourceTableId: readSourceTableId(entry),
        query: optionalText(entry.get("query")) ?? "",
        presentation: readPresentationSnapshot(entry),
    };
    return { ...descriptor, presentationRevision: gridPresentationRevision(descriptor) };
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

function invalid(message: string): McpReadError {
    return new McpReadError("invalid_argument", message, { effect: "none" });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, where: string): void {
    const unexpected = Object.keys(value).filter(key => !allowed.has(key));
    if (unexpected.length > 0) throw invalid(`Unsupported ${where} field(s): ${unexpected.join(", ")}`);
}

function utf8Bytes(value: string): number {
    return Buffer.byteLength(value, "utf8");
}

function assertBytes(value: string, limit: number, what: string): void {
    const bytes = utf8Bytes(value);
    if (bytes > limit) {
        throw new McpReadError("size_limit", `${what} of ${bytes} bytes exceeds the ${limit}-byte limit`, {
            effect: "none",
            actualBytes: bytes,
            limitBytes: limit,
        });
    }
}

function assertColumnKey(value: unknown, what: string): asserts value is string {
    if (typeof value !== "string" || value.trim() === "") throw invalid(`${what} must be a nonblank string`);
    assertBytes(value, MAX_GRID_COLUMN_KEY_BYTES, what);
}

function assertIds(projectId: unknown, gridId: unknown): asserts projectId is string {
    if (typeof projectId !== "string" || !ID.test(projectId)) throw invalid("Invalid project ID");
    if (typeof gridId !== "string" || !ID.test(gridId)) throw invalid("Invalid Grid ID");
}

interface ValidatedRequest {
    projectId: string;
    gridId: string;
    expectedPresentationRevision: string;
    changes: ValidatedChanges;
    dryRun: boolean;
}

interface ValidatedChanges {
    name?: string;
    columnOrder?: string[];
    /** Exact result-name keys, in request order. */
    components?: [string, GridComponentChange][];
    showAddRowButton?: boolean;
    confirmRowDelete?: boolean;
}

/** Validate the complete request before any effect. Throws a no-effect invalid_argument / size_limit. */
export function validateGridPresentationRequest(request: unknown): ValidatedRequest {
    if (!isPlainObject(request)) throw invalid("A Grid presentation update request is required");
    rejectUnknownKeys(request, REQUEST_KEYS, "request");
    const { projectId, gridId, expectedPresentationRevision, changes, dryRun } = request;
    assertIds(projectId, gridId);
    if (
        typeof expectedPresentationRevision !== "string" || expectedPresentationRevision.trim() === ""
        || expectedPresentationRevision.length > MAX_PRESENTATION_REVISION_LENGTH
    ) {
        throw invalid(
            `expectedPresentationRevision must be a nonblank string of at most ${MAX_PRESENTATION_REVISION_LENGTH} characters`,
        );
    }
    if (dryRun !== undefined && typeof dryRun !== "boolean") throw invalid("dryRun must be a boolean");
    if (!isPlainObject(changes)) throw invalid("changes must be an object");
    rejectUnknownKeys(changes, CHANGE_KEYS, "changes");
    if (Object.keys(changes).length === 0) throw invalid("changes must contain at least one field");
    let serialized: string;
    try {
        serialized = JSON.stringify(changes);
    } catch {
        throw invalid("changes must be JSON-serializable");
    }
    assertBytes(serialized, MAX_GRID_CHANGES_BYTES, "Serialized changes");

    const validated: ValidatedChanges = {};
    if ("name" in changes) {
        if (typeof changes.name !== "string") throw invalid("name must be a string");
        assertBytes(changes.name, MAX_GRID_TEXT_BYTES, "name");
        validated.name = changes.name;
    }
    if ("columnOrder" in changes) {
        const order = changes.columnOrder;
        if (!Array.isArray(order)) throw invalid("columnOrder must be an array of column names");
        if (order.length > MAX_GRID_PRESENTATION_COLUMNS) {
            throw invalid(`columnOrder may list at most ${MAX_GRID_PRESENTATION_COLUMNS} columns`);
        }
        const seen = new Set<string>();
        for (const column of order) {
            assertColumnKey(column, "columnOrder entry");
            if (seen.has(column)) throw invalid(`columnOrder lists "${column}" more than once`);
            seen.add(column);
        }
        validated.columnOrder = [...order] as string[];
    }
    if ("components" in changes) {
        const components = changes.components;
        if (!isPlainObject(components)) throw invalid("components must be an object keyed by result column name");
        const entries = Object.entries(components);
        if (entries.length === 0 || entries.length > MAX_GRID_PRESENTATION_COLUMNS) {
            throw invalid(`components must configure 1 to ${MAX_GRID_PRESENTATION_COLUMNS} columns`);
        }
        validated.components = entries.map(([column, settings]) => {
            assertColumnKey(column, "components key");
            if (!isPlainObject(settings)) throw invalid(`components["${column}"] must be an object`);
            if ("hidden" in settings) {
                throw invalid(`components["${column}"].hidden is not supported; use shown`);
            }
            rejectUnknownKeys(settings, COMPONENT_KEYS, `components["${column}"]`);
            if (Object.keys(settings).length === 0) {
                throw invalid(`components["${column}"] must set label, type, or shown`);
            }
            const change: GridComponentChange = {};
            if ("label" in settings) {
                if (settings.label !== null && typeof settings.label !== "string") {
                    throw invalid(`components["${column}"].label must be a string or null`);
                }
                if (typeof settings.label === "string") assertBytes(settings.label, MAX_GRID_TEXT_BYTES, "label");
                change.label = settings.label;
            }
            if ("type" in settings) {
                if (settings.type !== null && !(GRID_COMPONENT_TYPES as readonly unknown[]).includes(settings.type)) {
                    throw invalid(
                        `components["${column}"].type must be one of ${GRID_COMPONENT_TYPES.join(", ")} or null`,
                    );
                }
                change.type = settings.type as GridComponentType | null;
            }
            if ("shown" in settings) {
                if (typeof settings.shown !== "boolean") {
                    throw invalid(`components["${column}"].shown must be a boolean`);
                }
                change.shown = settings.shown;
            }
            return [column, change];
        });
    }
    for (const flag of ["showAddRowButton", "confirmRowDelete"] as const) {
        if (flag in changes) {
            if (typeof changes[flag] !== "boolean") throw invalid(`${flag} must be a boolean`);
            validated[flag] = changes[flag] as boolean;
        }
    }
    return {
        projectId,
        gridId: gridId as string,
        expectedPresentationRevision,
        changes: validated,
        dryRun: dryRun ?? false,
    };
}

// ---------------------------------------------------------------------------
// Candidate and leaf plan
// ---------------------------------------------------------------------------

/** A label override after trimming; null clears it. */
function normalizedLabel(label: string | null): string | null {
    if (label === null) return null;
    const trimmed = label.trim();
    return trimmed === "" ? null : trimmed;
}

const DEFAULT_COMPONENT: GridComponentPresentation = { label: null, type: null, shown: true };

function isDefaultComponent(component: GridComponentPresentation): boolean {
    return component.label === null && component.type === null && component.shown;
}

/**
 * The presentation an apply of `changes` would produce (pure, detached). It
 * mirrors planLeafOps followed by readPresentationSnapshot: saved component
 * keys stay represented (a cleared map is kept, never removed), an absent
 * column gains a saved map only when a setting becomes non-default, and
 * names that are merely ordered are represented with default settings.
 */
function candidatePresentation(
    entry: Y.Map<unknown>,
    current: GridPresentation,
    changes: ValidatedChanges,
): GridPresentation {
    const container = entry.get("components");
    const saved = new Map<string, GridComponentPresentation>(
        container instanceof Y.Map
            ? [...container.keys()].map(column => [column, { ...(current.components[column] ?? DEFAULT_COMPONENT) }])
            : [],
    );
    for (const [column, change] of changes.components ?? []) {
        const next = { ...(saved.get(column) ?? current.components[column] ?? DEFAULT_COMPONENT) };
        if (change.label !== undefined) next.label = normalizedLabel(change.label);
        if (change.type !== undefined) next.type = change.type;
        if (change.shown !== undefined) next.shown = change.shown;
        if (saved.has(column) || !isDefaultComponent(next)) saved.set(column, next);
    }
    const columnOrder = changes.columnOrder ? [...changes.columnOrder] : [...current.columnOrder];
    const names = [...new Set([...saved.keys(), ...columnOrder])].sort(compareCodeUnits);
    return {
        name: changes.name ?? current.name,
        columnOrder,
        components: Object.fromEntries(names.map(column => [column, saved.get(column) ?? { ...DEFAULT_COMPONENT }])),
        showAddRowButton: changes.showAddRowButton ?? current.showAddRowButton,
        confirmRowDelete: changes.confirmRowDelete ?? current.confirmRowDelete,
    };
}

/** One leaf write, plus how to tell afterwards whether it took effect. */
interface LeafOp {
    apply(): void;
    isApplied(): boolean;
}

function setLeaf(map: Y.Map<unknown>, key: string, value: unknown): LeafOp {
    return { apply: () => map.set(key, value), isApplied: () => map.get(key) === value };
}

function setOrder(entry: Y.Map<unknown>, order: string[]): LeafOp {
    const value = [...order];
    return {
        apply: () => entry.set("columnOrder", value),
        isApplied: () => {
            const stored = entry.get("columnOrder");
            return Array.isArray(stored) && stored.length === order.length && stored.every((c, i) => c === order[i]);
        },
    };
}

function deleteLeaf(map: Y.Map<unknown>, key: string): LeafOp {
    return { apply: () => map.delete(key), isApplied: () => !map.has(key) };
}

function attach(parent: Y.Map<unknown>, key: string, child: Y.Map<unknown>): LeafOp {
    return { apply: () => parent.set(key, child), isApplied: () => parent.get(key) === child };
}

/**
 * Plan the effective leaf writes of `changes` against the live entry. A field
 * whose snapshot value already equals the requested one produces no write, so
 * setting an effective default or clearing an absent override is a no-op.
 */
function planLeafOps(
    entry: Y.Map<unknown>,
    current: GridPresentation,
    changes: ValidatedChanges,
): LeafOp[] {
    const ops: LeafOp[] = [];
    if (changes.name !== undefined && changes.name !== current.name) ops.push(setLeaf(entry, "name", changes.name));
    if (changes.columnOrder !== undefined) {
        const order = changes.columnOrder;
        const same = order.length === current.columnOrder.length
            && order.every((column, index) => column === current.columnOrder[index]);
        if (!same) ops.push(order.length === 0 ? deleteLeaf(entry, "columnOrder") : setOrder(entry, order));
    }
    if (changes.showAddRowButton !== undefined && changes.showAddRowButton !== current.showAddRowButton) {
        ops.push(
            changes.showAddRowButton
                ? deleteLeaf(entry, "showAddRowButton")
                : setLeaf(entry, "showAddRowButton", false),
        );
    }
    if (changes.confirmRowDelete !== undefined && changes.confirmRowDelete !== current.confirmRowDelete) {
        ops.push(
            changes.confirmRowDelete ? setLeaf(entry, "confirmRowDelete", true) : deleteLeaf(entry, "confirmRowDelete"),
        );
    }

    const existingContainer = entry.get("components");
    const container = existingContainer instanceof Y.Map ? existingContainer as Y.Map<unknown> : undefined;
    if (existingContainer !== undefined && !container) {
        throw new McpReadError("validation_failed", "Grid component settings are not stored as a map", {
            effect: "none",
            code: "unsupported_component_storage",
        });
    }
    // Component maps created by this update (absent column, or absent container).
    const fresh = new Map<string, Y.Map<unknown>>();
    for (const [column, change] of changes.components ?? []) {
        const now = current.components[column] ?? DEFAULT_COMPONENT;
        const writes: [string, unknown][] = [];
        if (change.label !== undefined) {
            const label = normalizedLabel(change.label);
            if (label !== now.label) writes.push(["label", label ?? undefined]);
        }
        if (change.type !== undefined && change.type !== now.type) writes.push(["type", change.type ?? undefined]);
        if (change.shown !== undefined && change.shown !== now.shown) {
            writes.push(["hidden", change.shown ? undefined : true]);
        }
        if (writes.length === 0) continue;

        const existing = container?.get(column);
        if (existing !== undefined && !(existing instanceof Y.Map)) {
            throw new McpReadError("validation_failed", `Component settings for "${column}" are not stored as a map`, {
                effect: "none",
                code: "unsupported_component_storage",
                column,
            });
        }
        if (existing instanceof Y.Map) {
            // Leaf writes inside the existing per-column map; other fields
            // (known or unknown) are untouched, and the map is never removed.
            for (const [field, value] of writes) {
                ops.push(value === undefined ? deleteLeaf(existing, field) : setLeaf(existing, field, value));
            }
            continue;
        }
        // No map yet: clears are already effective, so only sets remain.
        const sets = writes.filter(([, value]) => value !== undefined);
        if (sets.length === 0) continue;
        const map = fresh.get(column) ?? new Y.Map<unknown>();
        for (const [field, value] of sets) map.set(field, value);
        fresh.set(column, map);
    }
    if (fresh.size > 0) {
        if (container) {
            for (const [column, map] of fresh) ops.push(attach(container, column, map));
        } else {
            const created = new Y.Map<unknown>();
            for (const [column, map] of fresh) created.set(column, map);
            ops.push(attach(entry, "components", created));
        }
    }
    return ops;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OutlinerGridPresentationService {
    constructor(
        private readonly hocuspocus: LiveRoomHost,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        /**
         * Durable storage acknowledgement for the configured production
         * persistence. Undefined only for intentionally nonpersistent
         * configurations, where an apply is confirmed on in-memory application.
         */
        private readonly storeDocument?: DocumentStore,
    ) {}

    /** Read one Grid's saved presentation definition and its presentation revision. */
    async readPresentation(uid: string, projectId: string, gridId: string): Promise<GridPresentationRead> {
        assertIds(projectId, gridId);
        await this.authorize(uid, projectId);
        const room = `projects/${projectId}`;
        const connection = await openLiveRoom(this.hocuspocus, room, uid, { effect: "none" });
        let read: GridPresentationRead;
        try {
            await this.authorize(uid, projectId);
            read = readGridPresentation(projectId, gridId, this.liveEntry(connection, room, gridId));
        } finally {
            await closeLiveRoom(this.hocuspocus, connection).catch(() => {});
        }
        // Recheck before disclosing a result that was awaited.
        await this.authorize(uid, projectId);
        return read;
    }

    async updatePresentation(
        uid: string,
        request: UpdateGridPresentationRequest,
        options: GridPresentationUpdateOptions = {},
    ): Promise<GridPresentationUpdateResult> {
        const { projectId, gridId, expectedPresentationRevision, changes, dryRun } = validateGridPresentationRequest(
            request,
        );
        await this.authorize(uid, projectId);
        const room = `projects/${projectId}`;
        let connection = await openLiveRoom(this.hocuspocus, room, uid, { effect: "none" });
        try {
            await options.beforeMutation?.();
            // Re-authorize after every asynchronous step, then resolve the
            // live Document (reopening the room if the held one was orphaned).
            let doc: Y.Doc | undefined;
            for (let attempt = 1; attempt <= 3 && !doc; attempt++) {
                await this.authorize(uid, projectId);
                const held = connection.document as unknown as Y.Doc;
                if (isLiveRoom(this.hocuspocus, room, held)) doc = held;
                else {
                    await closeLiveRoom(this.hocuspocus, connection);
                    connection = await openLiveRoom(this.hocuspocus, room, uid, { effect: "none" });
                }
            }
            if (!doc) throw new McpReadError("internal_failure", "Project room could not be held", { effect: "none" });

            // Mutation boundary: nothing below awaits until the transaction
            // has run, so the compared state is the state the patch applies to.
            const entry = this.liveEntry(connection, room, gridId);
            const prior = readGridPresentation(projectId, gridId, entry);
            if (prior.presentationRevision !== expectedPresentationRevision) {
                throw new McpReadError("stale_revision", "The Grid presentation has changed since it was read", {
                    effect: "none",
                    expectedPresentationRevision,
                    currentPresentationRevision: prior.presentationRevision,
                });
            }
            const ops = planLeafOps(entry, prior.presentation, changes);
            if (dryRun) {
                return {
                    dryRun: true,
                    applied: false,
                    projectId,
                    gridId,
                    presentation: prior.presentation,
                    presentationRevision: prior.presentationRevision,
                    priorPresentationRevision: prior.presentationRevision,
                    candidatePresentation: candidatePresentation(entry, prior.presentation, changes),
                    wouldChange: ops.length > 0,
                };
            }
            if (ops.length === 0) {
                return {
                    dryRun: false,
                    applied: false,
                    projectId,
                    gridId,
                    priorPresentationRevision: prior.presentationRevision,
                    presentationRevision: prior.presentationRevision,
                    presentation: prior.presentation,
                };
            }
            return await this.apply(uid, room, doc, entry, prior, ops);
        } catch (error) {
            if (error instanceof McpReadError) throw error;
            // Only steps before the mutation reach here (apply() converts
            // everything after it into a receipt), so nothing was written.
            throw new McpReadError("internal_failure", "Grid presentation update failed; nothing was changed", {
                effect: "none",
                cause: error instanceof Error ? error.message : String(error),
            });
        } finally {
            // Releasing a connection never changes an established outcome.
            await closeLiveRoom(this.hocuspocus, connection).catch(() => {});
        }
    }

    /** Apply the planned leaf writes in one transaction and establish what happened. */
    private async apply(
        uid: string,
        room: string,
        doc: Y.Doc,
        entry: Y.Map<unknown>,
        prior: GridPresentationRead,
        ops: LeafOp[],
    ): Promise<GridPresentationApplied> {
        const { projectId, gridId } = prior;
        let mutationError: unknown;
        try {
            doc.transact(() => {
                for (const op of ops) op.apply();
            }, MUTATION_ORIGIN);
        } catch (error) {
            // A throwing observer runs after the changes were applied.
            mutationError = error;
        }
        const appliedOps = ops.filter(op => op.isApplied()).length;
        if (appliedOps === 0) {
            throw new McpReadError("internal_failure", "Grid presentation update was not applied", {
                effect: "none",
                ...(mutationError !== undefined ? { cause: String(mutationError) } : {}),
            });
        }
        const unknown = (reason: string): GridPresentationReceipt => ({
            status: "unknown",
            dryRun: false,
            applied: null,
            projectId,
            gridId,
            priorPresentationRevision: prior.presentationRevision,
            reason,
        });
        let receipt: GridPresentationReceipt;
        if (appliedOps !== ops.length) {
            receipt = unknown(`Only part of the update was applied: ${String(mutationError)}`);
        } else {
            try {
                // The resulting definition is captured synchronously, before
                // storage is awaited, so a peer edit made meanwhile cannot
                // leak into the reported result.
                const result = readGridPresentation(projectId, gridId, entry);
                await this.storeDocument?.(room, doc);
                receipt = {
                    status: "applied",
                    dryRun: false,
                    applied: true,
                    projectId,
                    gridId,
                    priorPresentationRevision: prior.presentationRevision,
                    presentationRevision: result.presentationRevision,
                    presentation: result.presentation,
                };
            } catch (error) {
                // Any failure from here on (a storage error, a lost
                // acknowledgement) follows a write: never report no-effect.
                receipt = unknown(
                    `The durable result could not be established: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        // A grant revoked meanwhile does not authorize disclosing the
        // result. The effect itself stays: it was authorized, and is never
        // compensated by restoring an earlier state.
        try {
            await this.authorize(uid, projectId);
        } catch {
            throw new GridPresentationUndisclosedError(receipt);
        }
        if (receipt.status === "unknown") {
            throw new GridPresentationEffectError(receipt, "The Grid presentation update outcome is unknown");
        }
        const { status: _status, ...applied } = receipt;
        return applied;
    }

    private liveEntry(connection: DirectConnection, room: string, gridId: string): Y.Map<unknown> {
        const doc = connection.document as unknown as Y.Doc;
        if (!isLiveRoom(this.hocuspocus, room, doc)) {
            throw new McpReadError("internal_failure", "Project room was unloaded", { effect: "none" });
        }
        // Read through `share` so a read never defines a missing root type.
        const registry = doc.share.has("yjsGrids") ? doc.getMap<unknown>("yjsGrids") : undefined;
        const entry = registry?.get(gridId);
        if (!(entry instanceof Y.Map)) throw new McpReadError("not_found", "Grid not found", { effect: "none" });
        return entry as Y.Map<unknown>;
    }

    /** An unavailable or erroring ACL lookup is a denial. */
    private async authorize(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = await this.canAccess(uid, projectId);
        } catch {
            allowed = false;
        }
        if (allowed !== true) throw new McpReadError("forbidden", "Project is inaccessible", { effect: "none" });
    }
}
