// Framework-neutral storage for project-owned SQL declarations.
//
// Version 1 deliberately stores only an object's stable application identity,
// kind and exact committed source. SQL names and enum labels are properties of
// that source; they are not duplicated as independently editable metadata.

import { v4 as uuid } from "uuid";
import * as Y from "yjs";

export const SQL_CATALOG_KEY = "sqlCatalog";
export const SQL_CATALOG_FORMAT = 1;

export type SqlCatalogObjectKind = "enum";

export interface SqlCatalogSourceObject {
    readonly id: string;
    readonly kind: SqlCatalogObjectKind;
    readonly source: string;
}

export interface SqlCatalogSnapshot {
    readonly projectId: string;
    readonly format: 1;
    readonly objects: readonly Readonly<SqlCatalogSourceObject>[];
    /** Project-bound, deterministic descriptor of the complete source set. */
    readonly revision: string;
}

export type SqlCatalogReadResult =
    | { readonly status: "ready"; readonly snapshot: SqlCatalogSnapshot; }
    | { readonly status: "unavailable"; readonly reason: "project-document-unavailable"; }
    | { readonly status: "invalid"; readonly reason: string; }
    | { readonly status: "unsupported"; readonly reason: "format" | "kind"; readonly value: unknown; };

type CatalogRoot = Y.Map<unknown>;
type CatalogObjects = Y.Map<Y.Map<unknown>>;

function existingRoot(doc: Y.Doc): unknown {
    // Y.Doc#getMap registers a top-level type even on a read. Looking directly
    // in share lets a legacy document remain byte-for-byte untouched.
    const root = doc.share.get(SQL_CATALOG_KEY);
    // A top-level type reconstructed from an update starts as Yjs' generic
    // AbstractType placeholder until accessed through its typed getter.
    // Materializing an existing placeholder is a read and emits no update;
    // unlike calling getMap for an absent key, it does not register new state.
    if (root !== undefined && root.constructor === Y.AbstractType) {
        return doc.getMap<unknown>(SQL_CATALOG_KEY);
    }
    return root;
}

function rootForWrite(doc: Y.Doc): { root: CatalogRoot; objects: CatalogObjects; } {
    const current = existingRoot(doc);
    if (current !== undefined && !(current instanceof Y.Map)) {
        throw new Error("Invalid sqlCatalog: root must be a Y.Map");
    }
    const root = (current as CatalogRoot | undefined) ?? doc.getMap<unknown>(SQL_CATALOG_KEY);
    const format = root.get("format");
    const currentObjects = root.get("objects");
    if (format !== undefined && format !== SQL_CATALOG_FORMAT) {
        throw new Error(`Unsupported sqlCatalog format: ${String(format)}`);
    }
    if (currentObjects !== undefined && !(currentObjects instanceof Y.Map)) {
        throw new Error("Invalid sqlCatalog: objects must be a Y.Map");
    }
    let objects = currentObjects as CatalogObjects | undefined;
    doc.transact(() => {
        if (format === undefined) root.set("format", SQL_CATALOG_FORMAT);
        if (!objects) {
            objects = new Y.Map<Y.Map<unknown>>();
            root.set("objects", objects);
        }
    });
    return { root, objects: objects! };
}

function assertObjectId(id: string): void {
    if (id.length === 0) throw new Error("SQL catalog object ID must not be empty");
}

function assertKind(kind: string): asserts kind is SqlCatalogObjectKind {
    if (kind !== "enum") throw new Error(`Unsupported SQL catalog object kind: ${kind}`);
}

/** Create an ordinary source object with a fresh application identity. */
export function createSqlCatalogObject(
    doc: Y.Doc,
    kind: SqlCatalogObjectKind,
    source: string,
): string {
    assertKind(kind);
    const id = uuid();
    restoreSqlCatalogObject(doc, { id, kind, source });
    return id;
}

/**
 * Reinstate a captured source under its original, currently unoccupied ID.
 * Authorization/history validation intentionally belongs to a higher layer.
 */
export function restoreSqlCatalogObject(doc: Y.Doc, object: SqlCatalogSourceObject): void {
    assertObjectId(object.id);
    assertKind(object.kind);
    doc.transact(() => {
        const { objects } = rootForWrite(doc);
        if (objects.has(object.id)) throw new Error(`SQL catalog object already exists: ${object.id}`);
        const entry = new Y.Map<unknown>();
        entry.set("kind", object.kind);
        entry.set("source", object.source);
        objects.set(object.id, entry);
    });
}

/** Replace one committed source atomically while retaining its identity. */
export function replaceSqlCatalogSource(doc: Y.Doc, id: string, source: string): void {
    const root = existingRoot(doc);
    if (!(root instanceof Y.Map) || root.get("format") !== SQL_CATALOG_FORMAT) {
        throw new Error("SQL catalog is not a writable version 1 catalog");
    }
    const objects = root.get("objects");
    if (!(objects instanceof Y.Map)) throw new Error("Invalid sqlCatalog: objects must be a Y.Map");
    const entry = objects.get(id);
    if (!(entry instanceof Y.Map)) throw new Error(`SQL catalog object does not exist: ${id}`);
    const current = entry.get("source");
    if (typeof current !== "string") throw new Error(`Invalid SQL catalog source: ${id}`);
    if (current === source) return;
    entry.set("source", source);
}

/** Remove one source object without touching any other project-owned state. */
export function removeSqlCatalogObject(doc: Y.Doc, id: string): boolean {
    const root = existingRoot(doc);
    if (!(root instanceof Y.Map) || root.get("format") !== SQL_CATALOG_FORMAT) return false;
    const objects = root.get("objects");
    if (!(objects instanceof Y.Map) || !objects.has(id)) return false;
    objects.delete(id);
    return true;
}

function rotateRight(value: number, bits: number): number {
    return (value >>> bits) | (value << (32 - bits));
}

/** Small synchronous SHA-256 implementation, usable in browsers and workers. */
function sha256(value: string): string {
    const bytes = new TextEncoder().encode(value);
    const bitLength = bytes.length * 8;
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    const h = new Uint32Array([
        0x6a09e667,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ]);
    const k = SHA256_CONSTANTS;
    const w = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15];
            const b = w[i - 2];
            const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
            const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
            const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (s0 + maj) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0;
        h[1] = (h[1] + b) >>> 0;
        h[2] = (h[2] + c) >>> 0;
        h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0;
        h[5] = (h[5] + f) >>> 0;
        h[6] = (h[6] + g) >>> 0;
        h[7] = (h[7] + hh) >>> 0;
    }
    return [...h].map((part) => part.toString(16).padStart(8, "0")).join("");
}

const SHA256_CONSTANTS = new Uint32Array([
    0x428a2f98,
    0x71374491,
    0xb5c0fbcf,
    0xe9b5dba5,
    0x3956c25b,
    0x59f111f1,
    0x923f82a4,
    0xab1c5ed5,
    0xd807aa98,
    0x12835b01,
    0x243185be,
    0x550c7dc3,
    0x72be5d74,
    0x80deb1fe,
    0x9bdc06a7,
    0xc19bf174,
    0xe49b69c1,
    0xefbe4786,
    0x0fc19dc6,
    0x240ca1cc,
    0x2de92c6f,
    0x4a7484aa,
    0x5cb0a9dc,
    0x76f988da,
    0x983e5152,
    0xa831c66d,
    0xb00327c8,
    0xbf597fc7,
    0xc6e00bf3,
    0xd5a79147,
    0x06ca6351,
    0x14292967,
    0x27b70a85,
    0x2e1b2138,
    0x4d2c6dfc,
    0x53380d13,
    0x650a7354,
    0x766a0abb,
    0x81c2c92e,
    0x92722c85,
    0xa2bfe8a1,
    0xa81a664b,
    0xc24b8b70,
    0xc76c51a3,
    0xd192e819,
    0xd6990624,
    0xf40e3585,
    0x106aa070,
    0x19a4c116,
    0x1e376c08,
    0x2748774c,
    0x34b0bcb5,
    0x391c0cb3,
    0x4ed8aa4a,
    0x5b9cca4f,
    0x682e6ff3,
    0x748f82ee,
    0x78a5636f,
    0x84c87814,
    0x8cc70208,
    0x90befffa,
    0xa4506ceb,
    0xbef9a3f7,
    0xc67178f2,
]);

function snapshot(projectId: string, objects: SqlCatalogSourceObject[]): SqlCatalogSnapshot {
    objects.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const frozenObjects = objects.map((object) => Object.freeze({ ...object }));
    const revision = sha256(JSON.stringify([projectId, SQL_CATALOG_FORMAT, frozenObjects]));
    return Object.freeze({
        projectId,
        format: SQL_CATALOG_FORMAT,
        objects: Object.freeze(frozenObjects),
        revision,
    });
}

/** Read and immutably snapshot a loaded Project document without modifying it. */
export function readSqlCatalog(projectId: string, doc: Y.Doc | undefined): SqlCatalogReadResult {
    if (!doc) return { status: "unavailable", reason: "project-document-unavailable" };
    const root = existingRoot(doc);
    if (root === undefined) return { status: "ready", snapshot: snapshot(projectId, []) };
    if (!(root instanceof Y.Map)) return { status: "invalid", reason: "sqlCatalog root is not a Y.Map" };
    const format = root.get("format");
    if (format !== SQL_CATALOG_FORMAT) {
        return typeof format === "number" && format > SQL_CATALOG_FORMAT
            ? { status: "unsupported", reason: "format", value: format }
            : { status: "invalid", reason: "sqlCatalog format is missing or malformed" };
    }
    const storedObjects = root.get("objects");
    if (!(storedObjects instanceof Y.Map)) {
        return { status: "invalid", reason: "sqlCatalog objects is not a Y.Map" };
    }
    const objects: SqlCatalogSourceObject[] = [];
    for (const [id, value] of storedObjects.entries()) {
        if (!(value instanceof Y.Map)) return { status: "invalid", reason: `Object ${id} is not a Y.Map` };
        const kind = value.get("kind");
        if (kind !== "enum") return { status: "unsupported", reason: "kind", value: kind };
        const source = value.get("source");
        if (typeof source !== "string") return { status: "invalid", reason: `Object ${id} has invalid source` };
        objects.push({ id, kind, source });
    }
    return { status: "ready", snapshot: snapshot(projectId, objects) };
}
