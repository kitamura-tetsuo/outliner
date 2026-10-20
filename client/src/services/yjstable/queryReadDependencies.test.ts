import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { queryReadDependencies } from "./queryReadDependencies";
import { createTable, getTableRegistry } from "./tableDocs";

describe("stored SQL read inventory", () => {
    it("resolves EXISTS and JOIN reads without counting literals or aliases", () => {
        const doc = new Y.Doc();
        const a = createTable(doc, "Same label", "a");
        const b = createTable(doc, "Same label", "b");
        createTable(doc, "Unused", "c");
        const reads = queryReadDependencies(
            doc,
            "SELECT a.*, 'c' AS source_kind FROM a WHERE EXISTS (SELECT 1 FROM b)",
        );
        expect(reads).toEqual({ status: "complete", tableIds: [a, b], relationNames: ["a", "b"], diagnostics: [] });
    });

    it("distinguishes a proven empty read set from malformed or unsupported analysis", () => {
        const doc = new Y.Doc();
        expect(queryReadDependencies(doc, "SELECT 1 AS value")).toEqual({
            status: "complete",
            tableIds: [],
            relationNames: [],
            diagnostics: [],
        });
        for (
            const query of [
                "SELECT * FROM",
                "",
                "SELECT * FROM generate_series(1,2)",
                "WITH x AS (SELECT 1) SELECT * FROM x",
            ]
        ) {
            expect(queryReadDependencies(doc, query).status).toBe("unknown");
            expect(queryReadDependencies(doc, query).diagnostics.length).toBeGreaterThan(0);
        }
    });

    it("retains known reads and reports missing relations without executing SQL", () => {
        const doc = new Y.Doc();
        const a = createTable(doc, "A", "a");
        const b = createTable(doc, "B", "b");
        getTableRegistry(doc).delete(b);
        expect(queryReadDependencies(doc, "SELECT a.* FROM a JOIN b ON true")).toMatchObject({
            status: "unknown",
            tableIds: [a],
            relationNames: ["a", "b"],
        });
        expect(queryReadDependencies(doc, "SELECT * FROM outline_items")).toMatchObject({
            status: "complete",
            tableIds: [],
        });
    });
});
