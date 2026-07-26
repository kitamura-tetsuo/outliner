// Ownership of what is materialized in PGlite for a project.
//
// One table is materialized exactly once per project, no matter how many
// views show it or how many sibling queries reference it. That single
// ownership is what makes cross-table results deterministic: a query never
// depends on which blocks happen to be mounted, and a table that nobody needs
// any more is dropped instead of lingering as stale rows that would answer a
// later JOIN with plausible but outdated numbers.
//
// Views take a session, sessions take references, and adapters pin the
// relations their queries touched. Entries no longer reachable from a
// referencing session are swept — a mark phase, so two tables whose queries
// reference each other are collected too.

import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { enqueueWrite } from "./pgliteService";
import { projectSchemaName, quoteIdent } from "./sqlNames";
import {
    findSqlNameConflict,
    findTableIdBySqlName,
    getTableHandles,
    setTableSqlName,
    type TableHandles,
} from "./tableDocs";
import { type TableRegistryPort, TableSyncAdapter } from "./tableSyncAdapter";

const logger = getLogger("tableEngine");

const INITIAL_SYNC_TIMEOUT_MS = 10000;

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
    dispose: () => void;
}

interface Entry {
    key: string;
    tableId: string;
    pgSchema: string;
    /** References held by live sessions. */
    refs: number;
    /** Entry keys this table's query pulled in. */
    deps: Set<string>;
    handles: TableHandles;
    adapter: TableSyncAdapter;
    ready: Promise<AcquiredTable>;
    remoteSynced: boolean;
    disposeConnection?: () => Promise<void> | void;
}

const entries = new Map<string, Entry>();
let pendingWork: Promise<unknown> = Promise.resolve();

function entryKey(pgSchema: string, tableId: string): string {
    return `${pgSchema}::${tableId}`;
}

function createEntry(
    projectDoc: Y.Doc,
    projectId: string | undefined,
    pgSchema: string,
    tableId: string,
    connect: TableDocConnector,
): Entry | undefined {
    const handles = getTableHandles(projectDoc, tableId);
    if (!handles) return undefined;

    const key = entryKey(pgSchema, tableId);
    const registry: TableRegistryPort = {
        checkSqlNameConflict: (id, sqlName) => findSqlNameConflict(projectDoc, id, sqlName),
        recordSqlName: (id, sqlName) => setTableSqlName(projectDoc, id, sqlName),
        materializeRelation: async (sqlName) => {
            const targetId = findTableIdBySqlName(projectDoc, sqlName);
            if (!targetId || targetId === tableId) return false;
            const target = await acquireInternal(projectDoc, projectId, pgSchema, targetId, connect);
            if (!target) return false;
            // Pin the dependency so it stays materialized while this query
            // needs it, and is swept together with this entry.
            entries.get(key)?.deps.add(entryKey(pgSchema, targetId));
            // The registry name is only an index; the applied schema decides
            // whether the relation the query asked for really exists now.
            return target.adapter.appliedSchema?.tableName === sqlName;
        },
    };

    const adapter = new TableSyncAdapter(handles, { pgSchema, registry });
    const entry: Entry = {
        key,
        tableId,
        pgSchema,
        refs: 0,
        deps: new Set(),
        handles,
        adapter,
        remoteSynced: false,
        ready: Promise.resolve({ adapter, handles, remoteSynced: false }),
    };

    entry.ready = (async () => {
        if (projectId) {
            try {
                const connection = await connect(projectId, tableId, handles.doc);
                entry.disposeConnection = connection.dispose;
                // Seed PGlite only after the initial sync so the table is not
                // built from a half-loaded document.
                const sync = await connection
                    .waitForInitialSync(INITIAL_SYNC_TIMEOUT_MS)
                    .catch(() => ({ synced: false }));
                entry.remoteSynced = sync.synced;
            } catch (err) {
                logger.warn({ err, tableId }, "[tableEngine] table doc connection failed; continuing offline");
                entry.remoteSynced = false;
            }
        } else {
            entry.remoteSynced = true;
        }
        await adapter.start();
        return { adapter, handles, remoteSynced: entry.remoteSynced };
    })();

    entries.set(key, entry);
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
    const entry = entries.get(key) ?? createEntry(projectDoc, projectId, pgSchema, tableId, connect);
    if (!entry) return undefined;
    return await entry.ready;
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
        pendingWork = pendingWork.then(() => destroyEntry(entry)).catch(() => undefined);
    }
}

async function destroyEntry(entry: Entry): Promise<void> {
    const tableName = entry.adapter.appliedSchema?.tableName;
    entry.adapter.dispose();
    if (tableName) {
        try {
            await enqueueWrite(async (db) => {
                await db.exec(
                    `DROP TABLE IF EXISTS ${quoteIdent(entry.pgSchema)}.${quoteIdent(tableName)} CASCADE;`,
                );
            });
        } catch (err) {
            logger.warn({ err, tableName }, "[tableEngine] dropping a released table failed");
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

    return {
        acquire: async (tableId: string) => {
            if (disposed) return undefined;
            const key = entryKey(pgSchema, tableId);
            // Reference before awaiting so a concurrent sweep cannot collect
            // the entry while it is still being built.
            const existing = entries.get(key)
                ?? createEntry(projectDoc, projectId, pgSchema, tableId, connect);
            if (!existing) return undefined;
            existing.refs++;
            held.push(key);
            const acquired = await existing.ready;
            if (disposed) return undefined;
            return acquired;
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
        pendingWork = pendingWork.then(() => destroyEntry(entry)).catch(() => undefined);
    }
    await pendingWork;
}

/** Test-only: wait until pending releases finished. */
export async function waitForTableEngineIdle(): Promise<void> {
    await pendingWork;
}
