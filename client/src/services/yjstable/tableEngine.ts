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
// Losing the last view does not destroy an entry immediately: it becomes
// *warm* — still connected, still observing Yjs, still materialized — so
// reopening the same grid reuses the adapter and its last result instead of
// paying the cold cost again. The warm set is bounded by a TTL and an LRU
// limit, and eviction goes through the very same mark phase, so a relation is
// only ever dropped when nothing reachable still needs it.
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

/**
 * How long a relation stays materialized after its last view closed. Long
 * enough to cover navigating away and back within a working session, short
 * enough that a page left open on another screen does not hold subdoc
 * connections for the rest of the day.
 */
export const WARM_RETENTION_MS = 10 * 60 * 1000;

/**
 * How many released relations stay warm at once. Deliberately conservative:
 * every warm root pins a Yjs subdoc connection and a PGlite table in the one
 * shared in-memory engine, and revisits cluster on the few grids a user is
 * actually working with. Relations a warm root's query pulled in do not count
 * against the limit — they are held by their root, not by the cache.
 */
export const WARM_CACHE_MAX_ROOTS = 8;

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
    /** The project document this relation was built from. */
    projectDoc: Y.Doc;
    /** References held by live sessions. */
    refs: number;
    /** True once a session referenced it directly, rather than a query pulling it in. */
    rooted: boolean;
    /**
     * When the entry last became warm — a root nothing live references any
     * more. Undefined while a session holds it, and for relations that only
     * ever existed as another query's dependency. Doubles as the recency the
     * TTL and the LRU limit are measured against, which is the same instant:
     * an entry can only be released after it was last used.
     */
    warmSince: number | undefined;
    /**
     * False once the subdoc connection could not be established. Such an entry
     * still serves the views that hold it, offline, but it is never kept warm:
     * a revisit has to be a fresh attempt at connecting, not a reunion with an
     * adapter that will never receive anything.
     */
    warmable: boolean;
    /** Entry keys this relation's query pulled in. */
    deps: Set<string>;
    provider: RelationProvider;
    /** Resolves once the relation finished loading and materializing. */
    ready: Promise<unknown>;
    disposeConnection?: () => Promise<void> | void;
    /** Stops watching the document this relation mirrors. */
    unwatchDoc?: () => void;
}

const entries = new Map<string, Entry>();
let pendingWork: Promise<unknown> = Promise.resolve();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

/** Overridable so tests can expire the warm cache without waiting for it. */
let nowMs: () => number = () => Date.now();

function entryKey(pgSchema: string, id: string): string {
    return `${pgSchema}::${id}`;
}

/**
 * Reuse the entry under `key`. A warm one is only worth reusing while it still
 * mirrors the live project document over a connection that came up: an entry
 * of a document that has since been replaced observes something nobody writes
 * to any more, and one whose connection failed would hand the revisit the same
 * offline adapter instead of trying again. Entries a session still holds are
 * left alone — sharing one materialization between live views is the point.
 */
function reusableEntry(key: string, projectDoc: Y.Doc): Entry | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.refs === 0 && (entry.projectDoc !== projectDoc || !entry.warmable)) {
        entries.delete(key);
        scheduleDestroy(entry);
        return undefined;
    }
    return entry;
}

/**
 * A relation may outlive its views, but never its document. Deleting a table
 * destroys the subdoc it mirrors, and an entry left warm behind it would
 * answer a later query with the rows of something that no longer exists.
 */
function watchDoc(entry: Entry, doc: Y.Doc): void {
    const onDestroy = () => {
        if (entries.get(entry.key) !== entry) return;
        entries.delete(entry.key);
        scheduleDestroy(entry);
    };
    doc.on("destroy", onDestroy);
    entry.unwatchDoc = () => doc.off("destroy", onDestroy);
}

/** Recency for the warm cache: an entry just used is the last one to evict. */
function touch(entry: Entry): void {
    if (entry.refs > 0) entry.warmSince = undefined;
    else if (entry.rooted && entry.warmable) entry.warmSince = nowMs();
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
        projectDoc,
        refs: 0,
        rooted: false,
        warmSince: undefined,
        warmable: true,
        deps: new Set(),
        provider: new TableRelationProvider(handles, adapter, ready),
        ready,
    };
    watchDoc(entry, handles.doc);

    void (async () => {
        if (projectId) {
            try {
                const connection = await connect(projectId, tableId, handles.doc);
                entry.disposeConnection = connection.dispose;
                // Seed PGlite only after the initial sync so the table is not
                // built from a half-loaded document.
                const sync = await connection
                    .waitForInitialSync(INITIAL_SYNC_TIMEOUT_MS)
                    .catch((err) => {
                        logger.warn({ err, tableId }, "[tableEngine] waitForInitialSync failed");
                        return { synced: false };
                    });
                remoteSynced = sync.synced;
            } catch (err) {
                logger.warn({ err, tableId }, "[tableEngine] table doc connection failed; continuing offline");
                remoteSynced = false;
                // The views holding it keep working offline, but a revisit
                // must connect again rather than reuse this adapter.
                entry.warmable = false;
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
        projectDoc,
        refs: 0,
        rooted: false,
        warmSince: undefined,
        warmable: true,
        deps: new Set(),
        provider,
        ready: provider.materialize(),
    };
    watchDoc(entry, projectDoc);
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
    const entry = reusableEntry(key, projectDoc)
        ?? createTableEntry(projectDoc, projectId, pgSchema, tableId, connect);
    if (!entry) return undefined;
    touch(entry);
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
        const entry = reusableEntry(key, projectDoc) ?? createItemsEntry(projectDoc, pgSchema);
        touch(entry);
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

/**
 * The roots the cache holds on to: every entry a live session references, plus
 * the warm entries that are still within both the TTL and the LRU limit.
 */
function retainedRoots(now: number): Set<string> {
    const roots = new Set<string>();
    const warm: Entry[] = [];
    for (const entry of entries.values()) {
        if (entry.refs > 0) roots.add(entry.key);
        else if (entry.warmSince !== undefined && now - entry.warmSince < WARM_RETENTION_MS) {
            warm.push(entry);
        }
    }
    // Most recently released first, so the tail beyond the limit is the least
    // recently used part of the warm set.
    warm.sort((a, b) => b.warmSince! - a.warmSince!);
    for (const entry of warm.slice(0, WARM_CACHE_MAX_ROOTS)) roots.add(entry.key);
    return roots;
}

/**
 * Destroy every entry no retained root can reach.
 *
 * A mark phase rather than a per-entry decision, for the same reason it always
 * was: relations pulled in by a retained root's query must survive with it,
 * and two tables whose queries reference each other must still be collected
 * once nothing holds either of them.
 */
function sweep(): void {
    const now = nowMs();
    // Entries that just lost their last live reference become warm, and their
    // retention starts now.
    for (const entry of entries.values()) {
        if (entry.rooted && entry.warmable && entry.refs === 0 && entry.warmSince === undefined) {
            entry.warmSince = now;
        }
    }

    const reachable = retainedRoots(now);
    const queue = [...reachable];
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
        scheduleDestroy(entry);
    }
    scheduleWarmExpiry(now);
}

function scheduleDestroy(entry: Entry): void {
    pendingWork = pendingWork.then(() => destroyEntry(entry)).catch((err) =>
        logger.warn({ err }, "[tableEngine] destroying entry failed")
    );
}

/**
 * Arm a single timer for the next warm entry to expire, instead of polling.
 *
 * Only entries whose TTL is still ahead are considered: one that already
 * expired but survived the sweep is being kept alive by a root that reaches
 * it, and no timer can change that — whatever releases that root sweeps again.
 */
function scheduleWarmExpiry(now: number): void {
    let next: number | undefined;
    for (const entry of entries.values()) {
        if (entry.warmSince === undefined) continue;
        const expiresAt = entry.warmSince + WARM_RETENTION_MS;
        if (expiresAt > now && (next === undefined || expiresAt < next)) next = expiresAt;
    }
    if (expiryTimer !== undefined) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    if (next === undefined) return;
    expiryTimer = setTimeout(() => {
        expiryTimer = undefined;
        sweep();
    }, next - now);
    // A cache timer must never be the reason a Node process (a test run, say)
    // stays alive; browsers have no unref and do not need one.
    (expiryTimer as unknown as { unref?: () => void; }).unref?.();
}

async function destroyEntry(entry: Entry): Promise<void> {
    const relationName = entry.provider.sqlName;
    entry.unwatchDoc?.();
    entry.provider.dispose();
    // Destruction is queued, so a revisit may have replaced this entry while it
    // waited. The replacement materializes the same relation from the same
    // document, and dropping it here would leave the reopened view without the
    // table it just built — the successor owns the name now.
    const replaced = entries.has(entry.key);
    if (relationName && !replaced) {
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
        entry.rooted = true;
        entry.warmSince = undefined;
        held.push(entry.key);
    };

    return {
        acquire: async (tableId: string) => {
            if (disposed) return undefined;
            const key = entryKey(pgSchema, tableId);
            // Reference before awaiting so a concurrent sweep cannot collect
            // the entry while it is still being built.
            const existing = reusableEntry(key, projectDoc)
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
                hold(reusableEntry(key, projectDoc) ?? createItemsEntry(projectDoc, pgSchema));
            } else {
                const targetId = findTableIdBySqlName(projectDoc, sqlName);
                if (!targetId) return undefined;
                const key = entryKey(pgSchema, targetId);
                const entry = reusableEntry(key, projectDoc)
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

/**
 * Test-only: drop every materialization — warm ones included, ignoring their
 * remaining retention — clear the eviction bookkeeping, restore the real
 * clock, and wait for the cleanup to settle.
 */
export async function resetTableEngineForTests(): Promise<void> {
    const all = [...entries.values()];
    entries.clear();
    if (expiryTimer !== undefined) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    nowMs = () => Date.now();
    for (const entry of all) scheduleDestroy(entry);
    await pendingWork;
}

/** Test-only: wait until pending releases finished. */
export async function waitForTableEngineIdle(): Promise<void> {
    await pendingWork;
}

/**
 * Test-only: drive the warm cache's clock, so retention can be tested without
 * waiting for it. `resetTableEngineForTests()` restores the real clock, which
 * makes an `afterEach` reset enough to keep the override from leaking.
 */
export function setTableEngineClockForTests(clock: () => number): void {
    nowMs = clock;
}

/** Test-only: run the pass the expiry timer would run, and let it settle. */
export async function runWarmEvictionForTests(): Promise<void> {
    sweep();
    await pendingWork;
}

/** Test-only: whether an eviction is still armed. */
export function hasWarmExpiryTimerForTests(): boolean {
    return expiryTimer !== undefined;
}
