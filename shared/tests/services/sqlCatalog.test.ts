import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    createSqlCatalogObject,
    readSqlCatalog,
    removeSqlCatalogObject,
    replaceSqlCatalogSource,
    restoreSqlCatalogObject,
    SQL_CATALOG_KEY,
} from "../../src/services/sqlCatalog.js";

function clone(doc: Y.Doc): Y.Doc {
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    return copy;
}

function readySnapshot(projectId: string, doc: Y.Doc) {
    const result = readSqlCatalog(projectId, doc);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready SQL catalog");
    return result.snapshot;
}

describe("SQL catalog source storage", () => {
    it("persists exact sources and stable identities through independent reconstruction", () => {
        const doc = new Y.Doc();
        const firstSource = "-- colors\nCREATE TYPE color AS ENUM (\n  'red',\n  'blue'\n);\n";
        const firstId = createSqlCatalogObject(doc, "enum", firstSource);
        restoreSqlCatalogObject(doc, {
            id: "status-id",
            kind: "enum",
            source: "CREATE TYPE status AS ENUM ('open', 'closed');",
        });

        const persisted = Y.encodeStateAsUpdate(doc);
        doc.destroy();
        const reconstructed = new Y.Doc();
        Y.applyUpdate(reconstructed, persisted);

        expect(readySnapshot("project-a", reconstructed).objects).toEqual([
            { id: firstId, kind: "enum", source: firstSource },
            { id: "status-id", kind: "enum", source: "CREATE TYPE status AS ENUM ('open', 'closed');" },
        ].sort((left, right) => left.id.localeCompare(right.id)));

        expect(removeSqlCatalogObject(reconstructed, firstId)).toBe(true);
        restoreSqlCatalogObject(reconstructed, { id: firstId, kind: "enum", source: firstSource });
        expect(readySnapshot("project-a", clone(reconstructed)).objects.find((entry) => entry.id === firstId)?.source)
            .toBe(firstSource);
    });

    it("uses atomic no-op replacement and preserves unrelated entry fields", () => {
        const doc = new Y.Doc();
        restoreSqlCatalogObject(doc, { id: "one", kind: "enum", source: "CREATE TYPE one AS ENUM ('a');" });
        restoreSqlCatalogObject(doc, { id: "two", kind: "enum", source: "CREATE TYPE two AS ENUM ('b');" });
        const root = doc.getMap<unknown>(SQL_CATALOG_KEY);
        const first = root.get("one") as Y.Map<unknown>;
        const second = root.get("two") as Y.Map<unknown>;
        first.set("futureField", "preserve me");
        const updates: Uint8Array[] = [];
        doc.on("update", (update) => updates.push(update));

        replaceSqlCatalogSource(doc, "one", "CREATE TYPE one AS ENUM ('a');");
        expect(updates).toHaveLength(0);
        replaceSqlCatalogSource(doc, "one", "  CREATE TYPE one AS ENUM ('a', 'c'); -- exact\n");

        expect(updates).toHaveLength(1);
        expect(first.get("futureField")).toBe("preserve me");
        expect(second.get("source")).toBe("CREATE TYPE two AS ENUM ('b');");
    });

    it("preserves concurrent first objects created from a catalog-free project", () => {
        const legacy = new Y.Doc();
        legacy.getMap("pages").set("page-id", "legacy page");
        const left = clone(legacy);
        const right = clone(legacy);
        expect(left.share.has(SQL_CATALOG_KEY)).toBe(false);
        expect(right.share.has(SQL_CATALOG_KEY)).toBe(false);
        const leftUpdates: Uint8Array[] = [];
        const rightUpdates: Uint8Array[] = [];
        left.on("update", (update) => leftUpdates.push(update));
        right.on("update", (update) => rightUpdates.push(update));
        const leftSource = "-- left\nCREATE TYPE left_status AS ENUM ('open');";
        const rightSource = "-- right\nCREATE TYPE right_status AS ENUM ('closed');";

        const leftId = createSqlCatalogObject(left, "enum", leftSource);
        const rightId = createSqlCatalogObject(right, "enum", rightSource);
        [...rightUpdates].reverse().forEach((update) => Y.applyUpdate(left, update));
        leftUpdates.forEach((update) => Y.applyUpdate(right, update));

        const expected = [
            { id: leftId, kind: "enum", source: leftSource },
            { id: rightId, kind: "enum", source: rightSource },
        ].sort((a, b) => a.id.localeCompare(b.id));
        expect(readySnapshot("legacy-project", left).objects).toEqual(expected);
        expect(readySnapshot("legacy-project", right).objects).toEqual(expected);
        expect(readySnapshot("legacy-project", clone(left)).objects).toEqual(expected);
        expect(readySnapshot("legacy-project", clone(right)).objects).toEqual(expected);
    });

    it("merges disjoint client edits and converges whole-source conflicts", () => {
        const baseline = new Y.Doc();
        restoreSqlCatalogObject(baseline, { id: "one", kind: "enum", source: "CREATE TYPE one AS ENUM ('old');" });
        restoreSqlCatalogObject(baseline, { id: "two", kind: "enum", source: "CREATE TYPE two AS ENUM ('old');" });
        baseline.getMap("table-records").set("record-1", "unchanged");
        baseline.getMap("yjsGrids").set("grid-1", "SELECT * FROM one");
        const left = clone(baseline);
        const right = clone(baseline);
        const leftUpdates: Uint8Array[] = [];
        const rightUpdates: Uint8Array[] = [];
        left.on("update", (update) => leftUpdates.push(update));
        right.on("update", (update) => rightUpdates.push(update));

        replaceSqlCatalogSource(left, "one", "CREATE TYPE one AS ENUM ('left');");
        replaceSqlCatalogSource(right, "two", "CREATE TYPE two AS ENUM ('right');");
        leftUpdates.forEach((update) => Y.applyUpdate(right, update));
        rightUpdates.forEach((update) => Y.applyUpdate(left, update));

        expect(readySnapshot("project", left).objects.map((entry) => entry.source)).toEqual([
            "CREATE TYPE one AS ENUM ('left');",
            "CREATE TYPE two AS ENUM ('right');",
        ]);
        expect(Y.encodeStateAsUpdate(left)).toEqual(Y.encodeStateAsUpdate(right));
        expect(left.getMap("table-records").get("record-1")).toBe("unchanged");
        expect(left.getMap("yjsGrids").get("grid-1")).toBe("SELECT * FROM one");

        const conflictBase = clone(baseline);
        const a = clone(conflictBase);
        const b = clone(conflictBase);
        const aUpdates: Uint8Array[] = [];
        const bUpdates: Uint8Array[] = [];
        a.on("update", (update) => aUpdates.push(update));
        b.on("update", (update) => bUpdates.push(update));
        const sourceA = "CREATE TYPE one AS ENUM ('proposal-a');";
        const sourceB = "CREATE TYPE one AS ENUM ('proposal-b');";
        replaceSqlCatalogSource(a, "one", sourceA);
        replaceSqlCatalogSource(b, "one", sourceB);
        [...bUpdates].reverse().forEach((update) => Y.applyUpdate(a, update));
        [...aUpdates].reverse().forEach((update) => Y.applyUpdate(b, update));

        const resolvedA = readySnapshot("project", a).objects.find((entry) => entry.id === "one")!.source;
        const resolvedB = readySnapshot("project", b).objects.find((entry) => entry.id === "one")!.source;
        expect(resolvedA).toBe(resolvedB);
        expect([sourceA, sourceB]).toContain(resolvedA);
    });
});
