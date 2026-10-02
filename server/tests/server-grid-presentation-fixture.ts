import { HocuspocusProvider } from "@hocuspocus/provider";
import { type Hocuspocus, Server } from "@hocuspocus/server";
import * as Y from "yjs";
import {
    createGridEntry,
    getGridColumnOrder,
    getGridConfirmRowDelete,
    getGridDefinitionTarget,
    getGridQuery,
    getGridShowAddRowButton,
    type GridDefinitionTarget,
    readGridComponents,
} from "../../shared/src/services/gridDefinition.js";
import { loadConfig } from "../src/config.js";
import { createPersistence } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";

/**
 * Shared fixture for the Grid presentation regressions (issue #5435).
 *
 * Grids are created and edited with the browser's own production writers
 * (shared/src/services/gridDefinition.ts, re-exported by the client's
 * gridDocs.ts) on a peer Y.Doc that exchanges real Yjs updates with the live
 * server room, the way a connected browser does. Results are read back with
 * the client's normal Grid readers on a fresh Y.Doc.
 */

export const PROJECT = "proj-grid";
export const TABLE_ID = "table-tasks";
export const OTHER_TABLE_ID = "table-other";

/**
 * A connected collaborator: a Y.Doc kept in sync with the live room through
 * real binary Yjs updates. `hold()` takes it offline (updates in both
 * directions are buffered) until `release()` delivers them.
 */
export class Peer {
    readonly doc = new Y.Doc();
    /** Updates buffered in each direction while the peer is offline. */
    private outbox: Uint8Array[] | undefined;
    private inbox: Uint8Array[] | undefined;
    private readonly toLive = (update: Uint8Array, origin: unknown) => {
        if (origin === this) return;
        if (this.outbox) this.outbox.push(update);
        else Y.applyUpdate(this.live, update, this);
    };
    private readonly toPeer = (update: Uint8Array, origin: unknown) => {
        if (origin === this) return;
        if (this.inbox) this.inbox.push(update);
        else Y.applyUpdate(this.doc, update, this);
    };

    private constructor(private readonly live: Y.Doc, private readonly close: () => Promise<void>) {
        Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(live), this);
        this.doc.on("update", this.toLive);
        live.on("update", this.toPeer);
    }

    static async connect(hocuspocus: Hocuspocus, projectId = PROJECT): Promise<Peer> {
        const connection = await hocuspocus.openDirectConnection(`projects/${projectId}`, {});
        return new Peer(connection.document as unknown as Y.Doc, () => connection.disconnect());
    }

    get project(): Project {
        return Project.fromDoc(this.doc);
    }

    grid(gridId: string): GridDefinitionTarget {
        const target = getGridDefinitionTarget(this.doc, gridId);
        if (!target) throw new Error(`Grid ${gridId} not found on peer`);
        return target;
    }

    /** Go offline: edits on either side stay concurrent until `release()`. */
    hold(): void {
        this.outbox ??= [];
        this.inbox ??= [];
    }

    /** Reconnect: deliver the peer's buffered updates to the room, then the room's to the peer. */
    release(): void {
        const outgoing = this.outbox ?? [];
        const incoming = this.inbox ?? [];
        this.outbox = undefined;
        this.inbox = undefined;
        for (const update of outgoing) Y.applyUpdate(this.live, update, this);
        for (const update of incoming) Y.applyUpdate(this.doc, update, this);
    }

    async disconnect(): Promise<void> {
        this.doc.off("update", this.toLive);
        this.live.off("update", this.toPeer);
        await this.close();
    }
}

/**
 * Seed a project through a peer with the normal client writers: a Page with
 * two placements of the Tasks Grid, a separate Grid over the same Table, and
 * a Grid over another Table.
 */
export async function seedGridProject(hocuspocus: Hocuspocus, projectId = PROJECT) {
    const peer = await Peer.connect(hocuspocus, projectId);
    const doc = peer.doc;
    const project = Project.createInstance(`Project ${projectId}`);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(project.ydoc));
    const page = peer.project.addPage("Plans", "owner");
    page.items.addNode("owner").updateText("ordinary item");
    for (const [tableId, sqlName] of [[TABLE_ID, "tasks"], [OTHER_TABLE_ID, "other_table"]]) {
        const table = new Y.Map<unknown>();
        table.set("name", sqlName);
        table.set("sqlName", sqlName);
        table.set("doc", new Y.Doc({ guid: `${projectId}--table--${tableId}` }));
        doc.getMap("yjsTables").set(tableId, table);
    }
    createGridEntry(doc, "grid-tasks", TABLE_ID, {
        name: "Tasks",
        query: "SELECT id, title, due_date, done FROM tasks",
    });
    createGridEntry(doc, "grid-separate", TABLE_ID, {
        name: "Separate",
        query: "SELECT id, title, due_date, done FROM tasks",
    });
    createGridEntry(doc, "grid-other", OTHER_TABLE_ID, { name: "Other", query: "SELECT id FROM other_table" });
    for (const gridId of ["grid-tasks", "grid-tasks", "grid-separate"]) {
        const placement = page.items.addNode("owner");
        placement.componentType = "yjstable";
        placement.yjsGridId = gridId;
    }
    await peer.disconnect();

    const tableRoom = await hocuspocus.openDirectConnection(`projects/${projectId}/tables/${TABLE_ID}`, {});
    const tableDoc = tableRoom.document as unknown as Y.Doc;
    tableDoc.getText("schema").insert(
        0,
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, due_date DATE, done BOOLEAN)",
    );
    const record = new Y.Map<unknown>();
    record.set("id", "r1");
    record.set("title", "Write report");
    record.set("due_date", "2026-10-31");
    record.set("done", false);
    tableDoc.getMap("data").set("r1", record);
    await tableRoom.disconnect();
}

/** The client's normal Grid readers over a fresh Y.Doc holding `state`. */
export function readGridAsClient(state: Uint8Array, gridId: string) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const entry = doc.getMap<Y.Map<unknown>>("yjsGrids").get(gridId);
    if (!entry) return undefined;
    const components = entry.get("components");
    const target = {
        entry,
        components: components instanceof Y.Map ? components : new Y.Map(),
    } as Pick<GridDefinitionTarget, "entry" | "components">;
    return {
        name: entry.get("name"),
        sourceTableId: entry.get("sourceTableId"),
        query: getGridQuery(target),
        columnOrder: getGridColumnOrder(target),
        showAddRowButton: getGridShowAddRowButton(target),
        confirmRowDelete: getGridConfirmRowDelete(target),
        ...readGridComponents(target),
    };
}

/** JSON view of Yjs content in which a subdocument is identified by its guid. */
function plain(value: unknown): unknown {
    if (value instanceof Y.Doc) return { subdoc: value.guid };
    if (value instanceof Y.Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [k, plain(v)]));
    if (value instanceof Y.Array) return value.toArray().map(plain);
    if (value instanceof Y.AbstractType) return value.toJSON();
    return value;
}

/** Everything a presentation update must leave untouched in the project room. */
export function untouchedState(doc: Y.Doc, gridId: string) {
    const project = Project.fromDoc(doc);
    const placements: { id: string; gridId: unknown; kind: unknown; }[] = [];
    const pages: unknown[] = [];
    for (const page of project.items) {
        pages.push({ id: page.id, text: page.text });
        for (const item of page.items) {
            placements.push({ id: item.id, gridId: item.yjsGridId, kind: item.componentType });
        }
    }
    const grids = doc.getMap<Y.Map<unknown>>("yjsGrids");
    const entry = grids.get(gridId)!;
    const others = Object.fromEntries(
        [...grids.entries()].filter(([id]) => id !== gridId).map(([id, other]) => [id, other.toJSON()]),
    );
    const otherRoots = Object.fromEntries(
        [...doc.share.keys()].filter(key => !["yjsGrids", "orderedTree"].includes(key)).sort()
            .map(key => [key, plain(doc.getMap(key))]),
    );
    return {
        sourceTableId: entry.get("sourceTableId"),
        query: entry.get("query"),
        sqlAliasPolicyVersion: entry.get("sqlAliasPolicyVersion"),
        pages,
        placements,
        others,
        otherRoots,
    };
}

export async function tableState(hocuspocus: Hocuspocus, projectId = PROJECT, tableId = TABLE_ID) {
    const connection = await hocuspocus.openDirectConnection(`projects/${projectId}/tables/${tableId}`, {});
    try {
        const doc = connection.document as unknown as Y.Doc;
        return { schema: doc.getText("schema").toString(), data: doc.getMap("data").toJSON() };
    } finally {
        await connection.disconnect();
    }
}

/** Capture every Yjs update the live room emits until `stop()`. */
export async function recordUpdates(hocuspocus: Hocuspocus, projectId = PROJECT) {
    const connection = await hocuspocus.openDirectConnection(`projects/${projectId}`, {});
    const doc = connection.document as unknown as Y.Doc;
    const updates: Uint8Array[] = [];
    const listener = (update: Uint8Array) => updates.push(update);
    doc.on("update", listener);
    return {
        updates,
        doc,
        async stop() {
            doc.off("update", listener);
            await connection.disconnect();
        },
    };
}

/**
 * An independent normal client over storage only: a real HocuspocusProvider
 * on a fresh Hocuspocus server whose only extension is the production SQLite
 * persistence. It reads exactly what storage holds.
 */
export async function readStoredGridAsClient(dir: string, gridId: string, projectId = PROJECT) {
    const config = loadConfig({ PORT: "0", LOG_LEVEL: "silent", DATABASE_PATH: dir });
    const persistence = await createPersistence(config);
    const server = new Server({ port: 0, quiet: true, extensions: persistence ? [persistence] : [] });
    await server.listen();
    const url = `ws://127.0.0.1:${(server.httpServer.address() as { port: number; }).port}`;
    const document = new Y.Doc();
    const provider = new HocuspocusProvider({ url, name: `projects/${projectId}`, document });
    try {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("sync timeout")), 8000);
            provider.on("synced", () => {
                clearTimeout(timer);
                resolve();
            });
        });
        return readGridAsClient(Y.encodeStateAsUpdate(document), gridId);
    } finally {
        provider.destroy();
        await server.destroy();
        persistence?.db?.close();
    }
}
