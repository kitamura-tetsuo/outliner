// Framework-neutral Yjs writers and readers for one Kanban definition.
//
// A Kanban definition is an entry of the project document's `yjsKanbans`
// registry: a project-owned view over one Table's shared schema/data, like a
// Grid entry but with Kanban roles (grouping column, card-title column,
// visible detail columns and a preferred lane order) instead of Grid column
// settings. No card copies, query results, ranks or drag/editor state are
// stored here; cards are produced later by executing the stored SELECT.
//
// The definition is a flat handful of small fields that every collaborator
// loads eagerly with the project doc, so — like a Grid — it needs no subdoc.
// These functions live here, free of Svelte and undo-router state, so
// regression tests use the exact same code as the client instead of a copy.
//
// Every writer touches only its own key, so concurrent edits to different
// settings of the same Kanban merge cleanly. SQL NULL lane identity is a real
// `null` array element, distinct from every string (including "" and "NULL").

import * as Y from "yjs";

export const KANBAN_REGISTRY_KEY = "yjsKanbans";

/** One preferred lane value: an exact result string, or SQL NULL. */
export type KanbanLaneValue = string | null;

/**
 * The structural part of a Kanban's handles every writer needs. The client's
 * `KanbanHandles` (which also carries an undo manager) satisfies it.
 */
export interface KanbanDefinitionTarget {
    /** The project doc this Kanban belongs to. */
    projectDoc: Y.Doc;
    /** The registry Y.Map entry. */
    entry: Y.Map<unknown>;
}

export interface KanbanDefinitionSeed {
    name?: string;
    /** Exact SELECT text. Empty means incomplete configuration, never a query to run. */
    query?: string;
    /** Grouping result-column name. Absent/empty means unassigned. */
    groupField?: string;
    /** Card-title result-column name. Absent/empty means unassigned. */
    titleField?: string;
    /** Ordered visible detail-column names. */
    detailFields?: string[];
    /** Ordered preferred lane values; `null` is SQL NULL, distinct from every string. */
    laneOrder?: KanbanLaneValue[];
}

/** Supplied settings for `updateKanbanEntry`: only present keys are touched. */
export type KanbanUpdates = KanbanDefinitionSeed & {
    /** Re-point the definition at another Table. Validated by the caller. */
    sourceTableId?: string;
};

/** Plain-JS copy of a Kanban definition, detached from the Y.Doc. */
export interface KanbanSettings {
    name: string;
    sourceTableId: string;
    query: string;
    groupField?: string;
    titleField?: string;
    detailFields: string[];
    laneOrder: KanbanLaneValue[];
}

export function getKanbanRegistry(projectDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return projectDoc.getMap<Y.Map<unknown>>(KANBAN_REGISTRY_KEY);
}

function assertKanbanName(name: unknown): asserts name is string {
    if (typeof name !== "string") throw new Error("Kanban name must be a string");
}

function assertKanbanQuery(query: unknown): asserts query is string {
    if (typeof query !== "string") throw new Error("Kanban query must be a string");
}

function assertKanbanRoleField(field: string, value: unknown): asserts value is string {
    if (typeof value !== "string") throw new Error(`Kanban ${field} must be a string`);
}

function assertKanbanSourceTableId(sourceTableId: unknown): asserts sourceTableId is string {
    if (typeof sourceTableId !== "string" || sourceTableId.length === 0) {
        throw new Error("Kanban sourceTableId must be a non-empty string");
    }
}

/** Structural validation for the ordered visible detail-column names. */
export function assertValidKanbanDetailFields(value: unknown): asserts value is string[] {
    if (!Array.isArray(value) || value.some((field) => typeof field !== "string")) {
        throw new Error("Kanban detailFields must be an array of strings");
    }
    const seen = new Set<string>();
    for (const field of value as string[]) {
        if (seen.has(field)) throw new Error(`Duplicate Kanban detail field: ${JSON.stringify(field)}`);
        seen.add(field);
    }
}

/**
 * Structural validation for the ordered preferred lane values. SQL NULL is a
 * real `null`, distinct from every string; duplicates (including a repeated
 * `null`) are rejected rather than silently collapsed.
 */
export function assertValidKanbanLaneOrder(value: unknown): asserts value is KanbanLaneValue[] {
    if (!Array.isArray(value) || value.some((lane) => lane !== null && typeof lane !== "string")) {
        throw new Error("Kanban laneOrder must be an array of strings or null");
    }
    const seen = new Set<KanbanLaneValue>();
    for (const lane of value as KanbanLaneValue[]) {
        if (seen.has(lane)) {
            throw new Error(
                lane === null
                    ? "Duplicate Kanban lane value: null"
                    : `Duplicate Kanban lane value: ${JSON.stringify(lane)}`,
            );
        }
        seen.add(lane);
    }
}

/** Validate every supplied seed/update field before a mutation publishes any part of it. */
export function validateKanbanFields(fields: KanbanUpdates): void {
    if (fields.name !== undefined) assertKanbanName(fields.name);
    if (fields.sourceTableId !== undefined) assertKanbanSourceTableId(fields.sourceTableId);
    if (fields.query !== undefined) assertKanbanQuery(fields.query);
    if (fields.groupField !== undefined) assertKanbanRoleField("groupField", fields.groupField);
    if (fields.titleField !== undefined) assertKanbanRoleField("titleField", fields.titleField);
    if (fields.detailFields !== undefined) assertValidKanbanDetailFields(fields.detailFields);
    if (fields.laneOrder !== undefined) assertValidKanbanLaneOrder(fields.laneOrder);
}

/**
 * Add one complete Kanban entry to the registry under `kanbanId`. All
 * initialization happens in one transaction so observers never see a
 * partially populated definition.
 */
export function createKanbanEntry(
    projectDoc: Y.Doc,
    kanbanId: string,
    sourceTableId: string,
    options: KanbanDefinitionSeed = {},
): void {
    assertKanbanSourceTableId(sourceTableId);
    validateKanbanFields(options);
    projectDoc.transact(() => {
        const entry = new Y.Map<unknown>();
        entry.set("sourceTableId", sourceTableId);
        entry.set("name", options.name ?? "Kanban");
        if (options.query !== undefined) entry.set("query", options.query);
        if (options.groupField) entry.set("groupField", options.groupField);
        if (options.titleField) entry.set("titleField", options.titleField);
        if (options.detailFields && options.detailFields.length > 0) {
            entry.set("detailFields", [...options.detailFields]);
        }
        if (options.laneOrder && options.laneOrder.length > 0) entry.set("laneOrder", [...options.laneOrder]);
        getKanbanRegistry(projectDoc).set(kanbanId, entry);
    });
}

function readStringArray(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : value instanceof Y.Array ? value.toArray() : [];
    // De-duplicate for backward compatibility with documents that stored
    // duplicates before validation existed; writers always reject them.
    return Array.from(new Set(raw.filter((item): item is string => typeof item === "string")));
}

function readLaneOrder(value: unknown): KanbanLaneValue[] {
    const raw: unknown[] = Array.isArray(value) ? value : value instanceof Y.Array ? value.toArray() : [];
    const lanes = raw.filter((item): item is KanbanLaneValue => item === null || typeof item === "string");
    // `null` is an ordinary set member here, so a repeated SQL NULL still
    // collapses on read while staying distinct from "" and "NULL".
    return Array.from(new Set(lanes));
}

function readRoleField(entry: Y.Map<unknown>, key: string): string | undefined {
    const value = entry.get(key);
    return typeof value === "string" && value !== "" ? value : undefined;
}

/** Snapshot one registry entry into plain JS, without modifying the document. */
export function readKanbanSettings(entry: Y.Map<unknown>): KanbanSettings {
    const groupField = readRoleField(entry, "groupField");
    const titleField = readRoleField(entry, "titleField");
    return {
        name: String(entry.get("name") ?? "Kanban"),
        sourceTableId: String(entry.get("sourceTableId") ?? ""),
        query: String(entry.get("query") ?? ""),
        ...(groupField !== undefined ? { groupField } : {}),
        ...(titleField !== undefined ? { titleField } : {}),
        detailFields: readStringArray(entry.get("detailFields")),
        laneOrder: readLaneOrder(entry.get("laneOrder")),
    };
}

/** Resolve a Kanban's writer target. Returns undefined for absent/deleted ids without creating anything. */
export function getKanbanDefinitionTarget(projectDoc: Y.Doc, kanbanId: string): KanbanDefinitionTarget | undefined {
    const entry = getKanbanRegistry(projectDoc).get(kanbanId);
    if (!entry) return undefined;
    return { projectDoc, entry };
}

function laneArraysEqual(left: KanbanLaneValue[], right: KanbanLaneValue[]): boolean {
    return left.length === right.length && left.every((lane, index) => lane === right[index]);
}

/**
 * Whether applying `updates` to `entry` would change the document. Mirrors
 * `applyKanbanUpdates`' comparison (including empty-string-clears-role and
 * empty-array-clears-list), so canonical no-ops stay completely effect-free —
 * not even a capture-boundary split. Throws on structurally invalid updates,
 * like the writer.
 */
export function willKanbanUpdateChange(entry: Y.Map<unknown>, updates: KanbanUpdates): boolean {
    validateKanbanFields(updates);
    const current = readKanbanSettings(entry);
    if (updates.name !== undefined && updates.name !== current.name) return true;
    if (updates.sourceTableId !== undefined && updates.sourceTableId !== current.sourceTableId) return true;
    if (updates.query !== undefined && updates.query !== current.query) return true;
    if (updates.groupField !== undefined && (updates.groupField || undefined) !== current.groupField) return true;
    if (updates.titleField !== undefined && (updates.titleField || undefined) !== current.titleField) return true;
    if (updates.detailFields !== undefined && !laneArraysEqual(updates.detailFields, current.detailFields)) return true;
    if (updates.laneOrder !== undefined && !laneArraysEqual(updates.laneOrder, current.laneOrder)) return true;
    return false;
}

function setOrClearRole(entry: Y.Map<unknown>, key: string, value: string, current: string | undefined): void {
    const next = value || undefined;
    if (next === current) return;
    if (next === undefined) entry.delete(key);
    else entry.set(key, next);
}

/**
 * Modify only explicitly supplied settings and preserve unrelated ones. Every
 * supplied field is validated before any part of the mutation is published;
 * a structurally invalid update throws without touching the entry. Supplied
 * values equal to the stored ones perform no Yjs write at all. Returns
 * whether the document changed.
 */
export function applyKanbanUpdates(target: KanbanDefinitionTarget, updates: KanbanUpdates): boolean {
    validateKanbanFields(updates);
    if (!willKanbanUpdateChange(target.entry, updates)) return false;
    const current = readKanbanSettings(target.entry);
    target.projectDoc.transact(() => {
        if (updates.name !== undefined && updates.name !== current.name) target.entry.set("name", updates.name);
        if (updates.sourceTableId !== undefined && updates.sourceTableId !== current.sourceTableId) {
            target.entry.set("sourceTableId", updates.sourceTableId);
        }
        if (updates.query !== undefined && updates.query !== current.query) target.entry.set("query", updates.query);
        if (updates.groupField !== undefined) {
            setOrClearRole(target.entry, "groupField", updates.groupField, current.groupField);
        }
        if (updates.titleField !== undefined) {
            setOrClearRole(target.entry, "titleField", updates.titleField, current.titleField);
        }
        if (updates.detailFields !== undefined && !laneArraysEqual(updates.detailFields, current.detailFields)) {
            if (updates.detailFields.length === 0) target.entry.delete("detailFields");
            else target.entry.set("detailFields", [...updates.detailFields]);
        }
        if (updates.laneOrder !== undefined && !laneArraysEqual(updates.laneOrder, current.laneOrder)) {
            if (updates.laneOrder.length === 0) target.entry.delete("laneOrder");
            else target.entry.set("laneOrder", [...updates.laneOrder]);
        }
    });
    return true;
}
