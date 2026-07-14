import { afterAll, describe, expect, it } from "vitest";
import { resetPgliteForTests, TableSqlError } from "./pgliteService";
import { analyzeQueryEditability, assertSelectQuery } from "./queryAnalysis";
import { parseCreateTable } from "./schemaIntrospection";

afterAll(async () => {
    await resetPgliteForTests();
});

describe("assertSelectQuery", () => {
    it("accepts plain SELECT statements", () => {
        expect(assertSelectQuery("SELECT id FROM t")).toBe("SELECT id FROM t");
    });

    it("rejects mutations and multiple statements", () => {
        expect(() => assertSelectQuery("DELETE FROM t")).toThrow(TableSqlError);
        expect(() => assertSelectQuery("SELECT 1; SELECT 2")).toThrow(/exactly one/);
        expect(() => assertSelectQuery("SELECT 1; DROP TABLE t")).toThrow(TableSqlError);
        expect(() => assertSelectQuery("")).toThrow(/empty/);
    });

    it("ignores keywords inside string literals", () => {
        expect(assertSelectQuery("SELECT 'delete me' AS label FROM t")).toBeTruthy();
    });
});

describe("analyzeQueryEditability", () => {
    const schemaPromise = parseCreateTable(
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, points INTEGER)",
    );

    it("marks plain projections of schema columns editable (id excluded)", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability("SELECT id, title, points FROM tasks", schema, [
            "id",
            "title",
            "points",
        ]);
        expect(res.editable).toBe(true);
        expect([...res.editableColumns].sort()).toEqual(["points", "title"]);
    });

    it("is read-only without an id column in the result", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability("SELECT title FROM tasks", schema, ["title"]);
        expect(res.editable).toBe(false);
        expect(res.readOnlyReason).toMatch(/id column/);
    });

    it("is read-only for JOIN and aggregate queries", async () => {
        const schema = await schemaPromise;
        expect(
            analyzeQueryEditability("SELECT t.id FROM tasks t JOIN tasks u ON u.id = t.id", schema, ["id"])
                .editable,
        ).toBe(false);
        expect(
            analyzeQueryEditability("SELECT id, COUNT(*) AS n FROM tasks GROUP BY id", schema, ["id", "n"])
                .editable,
        ).toBe(false);
    });

    it("treats calculated columns as read-only", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability(
            "SELECT id, title, points * 2 AS doubled FROM tasks",
            schema,
            ["id", "title", "doubled"],
        );
        expect(res.editable).toBe(true);
        expect(res.editableColumns.has("doubled")).toBe(false);
        expect(res.editableColumns.has("title")).toBe(true);
    });

    it("is read-only when no schema is applied", () => {
        const res = analyzeQueryEditability("SELECT id FROM t", undefined, ["id"]);
        expect(res.editable).toBe(false);
    });
});
