// Ownership of what is materialized in PGlite for a project.
//
// One relation is materialized exactly once per project, no matter how many
// views show it or how many sibling queries reference it. That single
// ownership is what makes cross-relation results deterministic: a query never
// depends on which blocks happen to be mounted, and a relation that nobody
// needs any more is dropped instead of lingering as stale rows that would
// answer a later JOIN with plausible but outdated numbers.
//
// Views take a session, sessions take references, and adapters pin the
// relations their queries touched. Entries no longer reachable from a
// referencing session are swept — a mark phase, so two tables whose queries
// reference each other are collected too.
//
// Two kinds of relation share this machinery, behind one `RelationProvider`
// interface: a table (a subdoc's Data Storage) and the system `items`
// projection (outline items carrying a date).

import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { ITEMS_RELATION_NAME, ItemsRelationProvider } from "./itemsRelation";
import { enqueueWrite } from "./pgliteService";
import type { RelationProvider } from "./relationProvider";
import { projectSchemaName, quoteIdent } from "./sqlNames";
import {
    findSqlNameConflict,
    findTableIdBySqlName,
    getTableHandles,
    setTableSqlName,
    type TableHandles,
} from "./tableDocs";
import { TableRelationProvider } from "./tableRelationProvider";
import { type RelationRegistryPort, TableSyncAdapter } from "./tableSyncAdapter";

const logger = getLogger("tableEngine");

const INITIAL_SYNC_TIMEOUT_MS = 10000;

/** Entry key suffix of the project's single items projection. */
const ITEMS_ENTRY_ID = `@${ITEMS_RELATION_NAME}`;

export interface TableDocConnection {
    waitForInitialSync: (timeoutMs?: number) => Promise<{ synced: boolean; }>;
    dispose: () => Promise<void> | void;
}

/** Injectable so unit tests can run the engine without a provider. */
export type TableDocConnector = (
    projectId: string,
    tableId: string,
    doc: Y.Doc,
) => Promise<TableDocConnection>;

/**
 * The provider stack is imported lazily: table blocks are the only screens
 * that need it, and unit tests can drive the engine without it entirely.
 */
const defaultConnector: TableDocConnector = async (projectId, tableId, doc) => {
    const { connectTableDoc } = await import("../../lib/yjs/connection");
    return await connectTableDoc(projectId, tableId, doc);
};

export interface AcquiredTable {
    adapter: TableSyncAdapter;
    handles: TableHandles;
    /** False when the subdoc could not be synced with the server in time. */
    remoteSynced: boolean;
}

export interface TableEngineSession {
    /** Materialize a table and keep it alive until the session is disposed. */
    acquire: (tableId: string) => Promise<AcquiredTable | undefined>;
    /**
     * Materialize a relation by SQL name — a table of the project or the
     * system `items` projection — and keep it alive until the session is
     * disposed. This is the write-back entry point: the returned provider
     * declares what it accepts and applies writes to the owning Yjs structure.
     */
    resolveRelation: (sqlName: string) => Promise<RelationProvider | undefined>;
    dispose: () => void;
}

interface Entry {
    key: string;
    pgSchema: string;
    /** References held by live sessions. */
    refs: number;
    /** Entry keys this relation's query pulled in. */
    deps: Set<string>;
    provider: RelationProvider;
    /** Resolves once the relation finished loading and materializing. */
    ready: Promise<unknown>;
    disposeConnection?: () => Promise<void> | void;
}

const entries = new Map<string, Entry>();
let pendingWork: Promise<unknown> = Promise.resolve();

function entryKey(pgSchema: string, id: string): string {
    return `${pgSchema}::${id}`;
}

function createTableEntry(
    projectDoc: Y.Doc,
    projectId: string | undefined,
    pgSchema: string,
    tableId: string,
    connect: TableDocConnector,
): Entry | undefined {
    const handles = getTableHandles(projectDoc, tableId);
    if (!handles) return undefined;

    const key = entryKey(pgSchema, tableId);
    const registry: RelationRegistryPort = {
        checkSqlNameConflict: (id, sqlName) => findSqlNameConflict(projectDoc, id, sqlName),
        recordSqlName: (id, sqlName) => setTableSqlName(projectDoc, id, sqlName),
        resolveRelation: async (sqlName) => {
            const resolved = await resolveRelationInternal(projectDoc, projectId, pgSchema, sqlName, connect);
            if (!resolved || resolved.entry.key === key) return undefined;
            // Pin the dependency so it stays materialized while this query
            // needs it, and is swept together with this entry.
            entries.get(key)?.deps.add(resolved.entry.key);
            return resolved.provider;
        },
    };

    const adapter = new TableSyncAdapter(handles, { pgSchema, registry });
    let remoteSynced = false;
    // Deferred so the connection callback can write back onto `entry`.
    let resolveReady: (value: AcquiredTable) => void = () => {};
    let rejectReady: (reason: unknown) => void = () => {};
    const ready = new Promise<AcquiredTable>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });

    const entry: Entry = {
        key,
        pgSchema,
        refs: 0,
        deps: new Set(),
        provider: new TableRelationProvider(handles, adapter, ready),
        ready,
    };

    void (async () => {
        if (projectId) {
            try {
                const connection = await connect(projectId, tableId, handles.doc);
                entry.disposeConnection = connection.dispose;
                // Seed PGlite only after the initial sync so the table is not
                // built from a half-loaded document.
                const sync = await connection
                    .waitForInitialSync(INITIAL_SYNC_TIMEOUT_MS)
                    .catch(() => ({ synced: false }));
                remoteSynced = sync.synced;
            } catch (err) {
                logger.warn({ err, tableId }, "[tableEngine] table doc connection failed; continuing offline");
                remoteSynced = false;
            }
        } else {
            remoteSynced = true;
        }
        await adapter.start();
        return { adapter, handles, remoteSynced };
    })().then(resolveReady, rejectReady);

    entries.set(key, entry);
    return entry;
}

/**
 * The project's single items projection. Unlike a table it has no subdoc and
 * no schema to apply: the outline tree already lives in the project doc, so
 * the entry is ready as soon as the relation is built.
 */
function createItemsEntry(projectDoc: Y.Doc, pgSchema: string): Entry {
    const provider = new ItemsRelationProvider({ projectDoc, pgSchema });
    const entry: Entry = {
        key: entryKey(pgSchema, ITEMS_ENTRY_ID),
        pgSchema,
        refs: 0,
        deps: new Set(),
        provider,
        ready: provider.materialize(),
    };
    entries.set(entry.key, entry);
    return entry;
}

async function acquireInternal(
    projectDoc: Y.Doc,
    projectId: string | undefined,
    pgSchema: string,
    tableId: string,
    connect: TableDocConnector,
): Promise<AcquiredTable | undefined> {
    const key = entryKey(pgSchema, tableId);
    const entry = entries.get(key) ?? createTableEntry(projectDoc, projectId, pgSchema, tableId, connect);
    if (!entry) return undefined;
    return await entry.ready as AcquiredTable;
}

/**
 * Resolve a SQL name to the entry that owns it, materializing the relation.
 * Returns undefined when the project has no such relation, or when it could
 * not be materialized under exactly that name — the registry name is only an
 * index, the materialized relation is what a query actually resolves.
 */
async function resolveRelationInternal(
    projectDoc: Y.Doc,
    projectId: string | undefined,
    pgSchema: string,
    sqlName: string,
    connect: TableDocConnector,
): Promise<{ entry: Entry; provider: RelationProvider; } | undefined> {
    if (sqlName === ITEMS_RELATION_NAME) {
        const key = entryKey(pgSchema, ITEMS_ENTRY_ID);
        const entry = entries.get(key) ?? createItemsEntry(projectDoc, pgSchema);
        await entry.ready;
        if (!await entry.provider.materialize()) return undefined;
        return { entry, provider: entry.provider };
    }

    const targetId = findTableIdBySqlName(projectDoc, sqlName);
    if (!targetId) return undefined;
    const acquired = await acquireInternal(projectDoc, projectId, pgSchema, targetId, connect);
    if (!acquired) return undefined;
    const entry = entries.get(entryKey(pgSchema, targetId));
    if (!entry || entry.provider.sqlName !== sqlName) return undefined;
    return { entry, provider: entry.provider };
}

/** Destroy every entry that no live session can reach. */
function sweep(): void {
    const reachable = new Set<string>();
    const queue: string[] = [];
    for (const entry of entries.values()) {
        if (entry.refs > 0) {
            reachable.add(entry.key);
            queue.push(entry.key);
        }
    }
    while (queue.length > 0) {
        const current = entries.get(queue.pop()!);
        if (!current) continue;
        for (const dep of current.deps) {
            if (!reachable.has(dep) && entries.has(dep)) {
                reachable.add(dep);
                queue.push(dep);
            }
        }
    }

    for (const entry of [...entries.values()]) {
        if (reachable.has(entry.key)) continue;
        entries.delete(entry.key);
        pendingWork = pendingWork.then(() => destroyEntry(entry)).catch((err) =>
            logger.warn({ err }, "[tableEngine] destroying entry failed")
        );
    }
}

async function destroyEntry(entry: Entry): Promise<void> {
    const relationName = entry.provider.sqlName;
    entry.provider.dispose();
    if (relationName) {
        try {
            await enqueueWrite(async (db) => {
                await db.exec(
                    `DROP TABLE IF EXISTS ${quoteIdent(entry.pgSchema)}.${quoteIdent(relationName)} CASCADE;`,
                );
            });
        } catch (err) {
            logger.warn({ err, relationName }, "[tableEngine] dropping a released relation failed");
        }
    }
    try {
        await entry.disposeConnection?.();
    } catch {
        // provider already gone
    }
}

/**
 * Open a session for one project. Every view of a table block takes its own
 * session and disposes it on destroy.
 */
export function createTableEngineSession(options: {
    projectDoc: Y.Doc;
    projectId?: string;
    connect?: TableDocConnector;
}): TableEngineSession {
    const { projectDoc, projectId } = options;
    const connect = options.connect ?? defaultConnector;
    const pgSchema = projectSchemaName(projectId);
    const held: string[] = [];
    let disposed = false;

    /** Reference an entry for this session's lifetime. */
    const hold = (entry: Entry): void => {
        entry.refs++;
        held.push(entry.key);
    };

    return {
        acquire: async (tableId: string) => {
            if (disposed) return undefined;
            const key = entryKey(pgSchema, tableId);
            // Reference before awaiting so a concurrent sweep cannot collect
            // the entry while it is still being built.
            const existing = entries.get(key)
                ?? createTableEntry(projectDoc, projectId, pgSchema, tableId, connect);
            if (!existing) return undefined;
            hold(existing);
            const acquired = await existing.ready as AcquiredTable;
            if (disposed) return undefined;
            return acquired;
        },
        resolveRelation: async (sqlName: string) => {
            if (disposed) return undefined;
            // Same ordering as acquire: the items entry is created (and
            // referenced) before the first await.
            if (sqlName === ITEMS_RELATION_NAME) {
                const key = entryKey(pgSchema, ITEMS_ENTRY_ID);
                hold(entries.get(key) ?? createItemsEntry(projectDoc, pgSchema));
            } else {
                const targetId = findTableIdBySqlName(projectDoc, sqlName);
                if (!targetId) return undefined;
                const key = entryKey(pgSchema, targetId);
                const entry = entries.get(key)
                    ?? createTableEntry(projectDoc, projectId, pgSchema, targetId, connect);
                if (!entry) return undefined;
                hold(entry);
            }
            const resolved = await resolveRelationInternal(projectDoc, projectId, pgSchema, sqlName, connect);
            if (disposed) return undefined;
            return resolved?.provider;
        },
        dispose: () => {
            if (disposed) return;
            disposed = true;
            for (const key of held) {
                const entry = entries.get(key);
                if (entry) entry.refs = Math.max(0, entry.refs - 1);
            }
            held.length = 0;
            sweep();
        },
    };
}

/** Test-only: drop every materialization and wait for the cleanup to settle. */
export async function resetTableEngineForTests(): Promise<void> {
    const all = [...entries.values()];
    entries.clear();
    for (const entry of all) {
        pendingWork = pendingWork.then(() => destroyEntry(entry)).catch((err) =>
            logger.warn({ err }, "[tableEngine] destroying entry failed")
        );
    }
    await pendingWork;
}

/** Test-only: wait until pending releases finished. */
export async function waitForTableEngineIdle(): Promise<void> {
    await pendingWork;
}
