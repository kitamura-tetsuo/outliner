// What a relation in a project's Postgres schema is, independently of where
// its rows come from.
//
// Every relation PGlite serves used to come from the same place: a table
// subdoc's Data Storage `Y.Map`, keyed by record id. Projecting outline items
// adds a second kind, whose inverse mapping is different (item key -> node
// value field) and whose write capabilities are not a table's.
//
// A provider therefore declares three things:
//   - `materialize()`   build the relation in the project's Postgres schema;
//   - `applyWrite()`    apply a write back to the owning Yjs structure;
//   - `capabilities`    which of UPDATE / INSERT / DELETE it accepts, and what
//                       the caller must decide before it may.
//
// The invariant of the feature is unchanged: nobody writes to PGlite.
// `applyWrite` writes Yjs, and the provider's own observer path brings the
// change back into PGlite.

/** Values a relation column can carry, matching Data Storage's JSON primitives. */
export type RelationValue = string | number | boolean | null;

/**
 * Where a new row is created. Items have no implicit inbox: the destination is
 * chosen explicitly at each creation (with previously chosen destinations
 * offered as history by the UI), so it is part of the write, not a default.
 */
export interface RelationInsertDestination {
    /** Key of the parent item the new item is created under. */
    parentKey: string;
}

/**
 * What a DELETE means for a projected row. A projected item exists in the
 * relation only because it carries the projected field, so removing it from
 * the relation and destroying it are two different intentions and the caller
 * must say which — deleting is never silently destructive.
 */
export type RelationDeleteDisposition =
    /** Destroy the underlying record/item. */
    | "delete-source"
    /** Keep the item, clear the field that put it in the relation. */
    | "clear-projected-field";

export interface RelationInsertCapability {
    /** True when every INSERT must carry a `destination`. */
    requiresDestination: boolean;
}

export interface RelationDeleteCapability {
    /** True when every DELETE must carry a `disposition`. */
    requiresDisposition: boolean;
}

/**
 * The write operations a relation accepts. An absent `insert`/`delete` means
 * the operation is refused outright.
 */
export interface RelationCapabilities {
    update: boolean;
    insert?: RelationInsertCapability;
    delete?: RelationDeleteCapability;
}

export type RelationWrite =
    | { op: "UPDATE"; rowId: string; column: string; value: RelationValue; }
    | {
        op: "INSERT";
        values: Record<string, RelationValue>;
        destination?: RelationInsertDestination;
    }
    | { op: "DELETE"; rowId: string; disposition?: RelationDeleteDisposition; }
    /**
     * Add one value to a multi-valued (JSON-array-encoded) column without
     * reading the rest of the set back first — e.g. adding a tag to a
     * grouping lane via `Ctrl`/`Cmd`-drop (docs/crdt-sql-architecture.md
     * §6.3). Distinct from `UPDATE`, which replaces the whole column value:
     * on the items relation, appending to `tags` pushes onto the item's own
     * `Y.Array` so a concurrent add from another client merges instead of
     * racing a full-array replace.
     */
    | { op: "UPDATE_APPEND"; rowId: string; column: string; value: string; };

/** A write the relation's declared capabilities do not allow. */
export class RelationWriteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RelationWriteError";
    }
}

export interface RelationProvider {
    /**
     * The SQL name under which the relation is currently materialized, or ""
     * when nothing is materialized (an invalid or absent schema, say).
     */
    readonly sqlName: string;
    readonly capabilities: RelationCapabilities;
    /**
     * Ensure the relation exists in the project's Postgres schema. Resolves
     * false when it cannot be built (no valid schema, for example).
     */
    materialize(): Promise<boolean>;
    /** Apply a write back to the Yjs structure that owns the row. */
    applyWrite(write: RelationWrite): Promise<void>;
    /** Detach observers. Dropping the Postgres relation is the engine's job. */
    dispose(): void;
}

/**
 * Reject a write the relation does not accept, before any Yjs mutation
 * happens. This is what makes the capability declaration binding rather than
 * documentation: a caller cannot INSERT without naming a destination, or
 * DELETE without choosing between removing the item and clearing its field.
 */
export function assertWriteAllowed(
    capabilities: RelationCapabilities,
    write: RelationWrite,
    relationName: string,
): void {
    switch (write.op) {
        case "UPDATE":
        case "UPDATE_APPEND":
            if (!capabilities.update) {
                throw new RelationWriteError(`Relation "${relationName}" does not accept ${write.op}`);
            }
            return;
        case "INSERT": {
            const insert = capabilities.insert;
            if (!insert) {
                throw new RelationWriteError(`Relation "${relationName}" does not accept INSERT`);
            }
            if (insert.requiresDestination && !write.destination) {
                throw new RelationWriteError(
                    `INSERT into "${relationName}" requires an explicit destination: `
                        + "there is no implicit inbox, the parent is chosen at each creation",
                );
            }
            return;
        }
        case "DELETE": {
            const del = capabilities.delete;
            if (!del) {
                throw new RelationWriteError(`Relation "${relationName}" does not accept DELETE`);
            }
            if (del.requiresDisposition && !write.disposition) {
                throw new RelationWriteError(
                    `DELETE from "${relationName}" requires an explicit choice between `
                        + "deleting the item and clearing its date",
                );
            }
            return;
        }
    }
}

/**
 * A table accepts every operation and needs no decision from the caller: a row
 * is a record of its own Data Storage `Y.Map` and nothing else owns it.
 */
export const TABLE_RELATION_CAPABILITIES: RelationCapabilities = {
    update: true,
    insert: { requiresDestination: false },
    delete: { requiresDisposition: false },
};

/**
 * The items relation is deliberately asymmetric with a table, because the
 * inverse mapping is: an item exists independently of the relation, so both
 * creating and removing a row are decisions only the user can make.
 */
export const ITEMS_RELATION_CAPABILITIES: RelationCapabilities = {
    update: true,
    insert: { requiresDestination: true },
    delete: { requiresDisposition: true },
};
