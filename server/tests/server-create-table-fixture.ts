import { HocuspocusProvider } from "@hocuspocus/provider";
import { type Hocuspocus, Server } from "@hocuspocus/server";
import Database from "better-sqlite3";
import fs from "fs-extra";
import os from "os";
import path from "path";
import WebSocket from "ws";
import * as Y from "yjs";
import { checkContainerAccess } from "../src/access-control.js";
import { loadConfig } from "../src/config.js";
import { createPersistence } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";
import { startServer } from "../src/server.js";

(globalThis as { WebSocket?: unknown; }).WebSocket = WebSocket;

/**
 * Shared fixture for the standalone Table creation regressions (issue #5411).
 *
 * Everything runs through production modules: startServer() with the real
 * Hocuspocus rooms and the production SQLite persistence in an isolated
 * temporary directory, and the real resource-side ACL adapter
 * (checkContainerAccess). The only stand-in is the Firestore backing store
 * the adapter reads, an in-memory collection of projectUsers/containerUsers/
 * userProjects documents that tests grant, revoke, or make fail.
 */
export class AclStore {
    readonly docs = new Map<string, Record<string, unknown>>();
    failing = false;

    grant(collection: "projectUsers" | "containerUsers" | "userProjects", id: string, uid: string) {
        const key = `${collection}/${id}`;
        const ids = (this.docs.get(key)?.accessibleUserIds as string[] | undefined) ?? [];
        this.docs.set(key, { accessibleUserIds: [...ids, uid] });
    }

    revokeAll(id: string) {
        this.docs.delete(`projectUsers/${id}`);
        this.docs.delete(`containerUsers/${id}`);
    }

    /** Minimal Firestore surface checkContainerAccess reads: collection().doc().get(). */
    get firestore() {
        return {
            collection: (collection: string) => ({
                doc: (id: string) => ({
                    get: async () => {
                        if (this.failing) throw new Error("ACL backend unavailable");
                        const data = this.docs.get(`${collection}/${id}`);
                        return { exists: data !== undefined, data: () => data };
                    },
                }),
            }),
        } as never;
    }

    /** The production adapter over this store. */
    readonly checkAccess = (uid: string, projectId: string) => checkContainerAccess(uid, projectId, this.firestore);
}

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;

export function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "create-table-"));
}

export function dbFile(dir: string): string {
    return path.join(dir, "database.sqlite");
}

export async function startTestServer(dir: string, acl: AclStore) {
    process.env.ALLOW_TEST_ACCESS = "false";
    process.env.DISABLE_JOB_SCHEDULER = "true";
    delete process.env.DISABLE_PERSISTENCE;
    const res = await startServer(loadConfig({ PORT: "0", LOG_LEVEL: "silent", DATABASE_PATH: dir }), undefined, {
        checkContainerAccess: acl.checkAccess,
        verifyIdTokenCached: async () => {
            throw new Error("websocket auth is not used by these tests");
        },
    });
    await waitFor(() => Boolean(res.persistence?.db));
    return res;
}

export async function stopTestServer(server: TestServer | undefined) {
    if (!server) return;
    await server.shutdown();
    server.persistence?.db?.close();
}

/**
 * Model an abrupt restart: copy exactly what storage holds right now into a
 * new directory (no graceful shutdown flush of the old server, which keeps its
 * rooms in memory untouched) and start a new server on the copy.
 */
export async function restartFromStorage(dir: string, acl: AclStore) {
    const copy = tempDir();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
        if (fs.existsSync(dbFile(dir) + suffix)) fs.copyFileSync(dbFile(dir) + suffix, dbFile(copy) + suffix);
    }
    return { dir: copy, server: await startTestServer(copy, acl) };
}

/** Seed pre-existing project content (Pages, items, an existing Table and Grid) into the real room. */
export async function seedProject(hocuspocus: Hocuspocus, projectId: string) {
    const project = Project.createInstance(`Project ${projectId}`);
    const page = project.addPage("Plans", "owner");
    page.items.addNode("owner").updateText("existing item");
    const existing = new Y.Map<unknown>();
    existing.set("name", "Existing");
    existing.set("sqlName", "existing_table");
    existing.set("doc", new Y.Doc({ guid: `${projectId}--table--table-existing` }));
    project.ydoc.getMap("yjsTables").set("table-existing", existing);
    const grid = new Y.Map<unknown>();
    grid.set("sourceTableId", "table-existing");
    grid.set("query", "SELECT id FROM existing_table");
    project.ydoc.getMap("yjsGrids").set("grid-existing", grid);
    const connection = await hocuspocus.openDirectConnection(`projects/${projectId}`, {});
    Y.applyUpdate(connection.document as unknown as Y.Doc, Y.encodeStateAsUpdate(project.ydoc));
    await connection.disconnect();
    const table = await hocuspocus.openDirectConnection(`projects/${projectId}/tables/table-existing`, {});
    (table.document as unknown as Y.Doc).getText("schema").insert(0, "CREATE TABLE existing_table (id TEXT)");
    await table.disconnect();
}

/** Read a live room without changing it. */
export async function withRoom<T>(hocuspocus: Hocuspocus, room: string, fn: (doc: Y.Doc) => T): Promise<T> {
    const connection = await hocuspocus.openDirectConnection(room, {});
    try {
        return fn(connection.document as unknown as Y.Doc);
    } finally {
        await connection.disconnect();
    }
}

/** Everything creation must leave untouched, plus the Table registry. */
export function projectState(doc: Y.Doc) {
    const plain = (name: string) => doc.getMap(name).toJSON();
    const tables = Object.fromEntries(
        [...doc.getMap<Y.Map<unknown>>("yjsTables").entries()].map(([id, entry]) => [id, {
            name: entry.get("name"),
            sqlName: entry.get("sqlName"),
            docGuid: (entry.get("doc") as Y.Doc | undefined)?.guid,
        }]),
    );
    // Root types are defined lazily by whoever reads them; an empty one is not content.
    const other = Object.fromEntries(
        [...doc.share.keys()].filter(key => key !== "yjsTables").sort().map(key => [key, plain(key)])
            .filter(([, value]) => Object.keys(value as object).length > 0),
    );
    return { tables, other };
}

/** Persisted room names in the SQLite store. */
export function storedRooms(dir: string): string[] {
    const db = new Database(dbFile(dir), { readonly: true });
    try {
        return (db.prepare("SELECT name FROM documents ORDER BY name").all() as { name: string; }[]).map(row =>
            row.name
        );
    } finally {
        db.close();
    }
}

/**
 * An independent client: a real HocuspocusProvider over a Hocuspocus server
 * that only has the production SQLite persistence (no auth hooks, since the
 * production server's websocket auth needs Firebase). It resolves the Table
 * the way the browser does: registry entry -> subdocument -> Table room.
 */
export async function readAsClient(dir: string, projectId: string, tableId: string) {
    const config = loadConfig({ PORT: "0", LOG_LEVEL: "silent", DATABASE_PATH: dir });
    const persistence = await createPersistence(config);
    const server = new Server({ port: 0, quiet: true, extensions: persistence ? [persistence] : [] });
    await server.listen();
    const url = `ws://127.0.0.1:${(server.httpServer.address() as { port: number; }).port}`;
    const providers: HocuspocusProvider[] = [];
    const sync = async (name: string, document: Y.Doc) => {
        const provider = new HocuspocusProvider({ url, name, document });
        providers.push(provider);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`sync timeout for ${name}`)), 8000);
            provider.on("synced", () => {
                clearTimeout(timer);
                resolve();
            });
        });
    };
    try {
        const projectDoc = new Y.Doc();
        await sync(`projects/${projectId}`, projectDoc);
        const entry = projectDoc.getMap<Y.Map<unknown>>("yjsTables").get(tableId);
        const subdoc = entry?.get("doc");
        if (!(subdoc instanceof Y.Doc)) return { entry: entry?.toJSON(), subdoc: undefined };
        subdoc.load();
        await sync(`projects/${projectId}/tables/${tableId}`, subdoc);
        return {
            name: entry!.get("name"),
            sqlName: entry!.get("sqlName"),
            subdoc,
            schema: subdoc.getText("schema").toString(),
            recordCount: subdoc.getMap("data").size,
        };
    } finally {
        for (const provider of providers) provider.destroy();
        await server.destroy();
        persistence?.db?.close();
    }
}

export async function waitFor(condition: () => boolean, timeoutMs = 5000) {
    const started = Date.now();
    while (!condition()) {
        if (Date.now() - started > timeoutMs) throw new Error("waitFor timed out");
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

export function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

export async function rejection(
    promise: Promise<unknown>,
): Promise<{ code?: string; debug?: Record<string, unknown>; }> {
    try {
        await promise;
    } catch (error) {
        return error as { code?: string; debug?: Record<string, unknown>; };
    }
    throw new Error("Expected the operation to be refused");
}
