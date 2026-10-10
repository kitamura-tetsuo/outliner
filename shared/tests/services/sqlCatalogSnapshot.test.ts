import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    readSqlCatalog,
    replaceSqlCatalogSource,
    restoreSqlCatalogObject,
    SQL_CATALOG_KEY,
} from "../../src/services/sqlCatalog.js";

function snapshot(projectId: string, doc: Y.Doc) {
    const result = readSqlCatalog(projectId, doc);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready SQL catalog");
    return result.snapshot;
}

describe("SQL catalog snapshots", () => {
    it("is immutable, deterministic across insertion order, and project-bound", () => {
        const first = new Y.Doc();
        restoreSqlCatalogObject(first, { id: "b", kind: "enum", source: "CREATE TYPE b AS ENUM ('b');" });
        restoreSqlCatalogObject(first, { id: "a", kind: "enum", source: "CREATE TYPE a AS ENUM ('a');" });
        const captured = snapshot("project-a", first);

        const otherOrder = new Y.Doc();
        restoreSqlCatalogObject(otherOrder, { id: "a", kind: "enum", source: "CREATE TYPE a AS ENUM ('a');" });
        restoreSqlCatalogObject(otherOrder, { id: "b", kind: "enum", source: "CREATE TYPE b AS ENUM ('b');" });
        expect(captured.revision).toBe("127cad8c31e204864bc5efda7bd8cfafed71f2a29dc6701d3313de0115ddf191");
        expect(snapshot("project-a", otherOrder).revision).toBe(captured.revision);
        expect(snapshot("project-b", otherOrder).revision).not.toBe(captured.revision);

        replaceSqlCatalogSource(first, "a", "CREATE TYPE a AS ENUM ('changed');");
        restoreSqlCatalogObject(first, { id: "c", kind: "enum", source: "CREATE TYPE c AS ENUM ('c');" });
        expect(captured.objects).toEqual([
            { id: "a", kind: "enum", source: "CREATE TYPE a AS ENUM ('a');" },
            { id: "b", kind: "enum", source: "CREATE TYPE b AS ENUM ('b');" },
        ]);
        expect(snapshot("project-a", first).revision).not.toBe(captured.revision);
        expect(Object.isFrozen(captured)).toBe(true);
        expect(Object.isFrozen(captured.objects)).toBe(true);
    });

    it("reads legacy absence without writing and separates unavailable state", () => {
        const legacy = new Y.Doc();
        legacy.getMap("pages").set("page", "kept");
        const before = Y.encodeStateAsUpdate(legacy);

        const result = readSqlCatalog("legacy", legacy);
        expect(result).toMatchObject({ status: "ready", snapshot: { format: 1, objects: [] } });
        expect(Y.encodeStateAsUpdate(legacy)).toEqual(before);
        expect(legacy.share.has(SQL_CATALOG_KEY)).toBe(false);
        expect(readSqlCatalog("missing", undefined)).toEqual({
            status: "unavailable",
            reason: "project-document-unavailable",
        });
    });

    it("reports malformed, future-format, and unknown-kind state without rewriting it", () => {
        const malformed = new Y.Doc();
        const malformedRoot = malformed.getMap<unknown>(SQL_CATALOG_KEY);
        malformedRoot.set("format", 1);
        malformedRoot.set("malformed-object", "original malformed bytes");
        const malformedBefore = Y.encodeStateAsUpdate(malformed);
        expect(readSqlCatalog("project", malformed)).toMatchObject({ status: "invalid" });
        expect(Y.encodeStateAsUpdate(malformed)).toEqual(malformedBefore);
        expect(malformedRoot.get("malformed-object")).toBe("original malformed bytes");

        const future = new Y.Doc();
        future.getMap(SQL_CATALOG_KEY).set("format", 2);
        expect(readSqlCatalog("project", future)).toEqual({ status: "unsupported", reason: "format", value: 2 });

        const unknown = new Y.Doc();
        const root = unknown.getMap<unknown>(SQL_CATALOG_KEY);
        root.set("format", 1);
        const entry = new Y.Map<unknown>();
        entry.set("kind", "domain");
        entry.set("source", "CREATE DOMAIN positive AS integer CHECK (VALUE > 0);");
        root.set("future-object", entry);
        const unknownBefore = Y.encodeStateAsUpdate(unknown);
        expect(readSqlCatalog("project", unknown)).toEqual({ status: "unsupported", reason: "kind", value: "domain" });
        expect(Y.encodeStateAsUpdate(unknown)).toEqual(unknownBefore);
        expect(entry.get("source")).toBe("CREATE DOMAIN positive AS integer CHECK (VALUE > 0);");
    });
});
