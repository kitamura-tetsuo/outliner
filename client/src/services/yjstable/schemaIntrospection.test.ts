import { afterAll, describe, expect, it } from "vitest";
import { resetPgliteForTests, TableSqlError } from "./pgliteService";
import {
    assertSingleCreateTable,
    columnKindFromDataType,
    diffSchemas,
    extractCheckInOptions,
    parseCreateTable,
} from "./schemaIntrospection";

afterAll(async () => {
    await resetPgliteForTests();
});

describe("assertSingleCreateTable", () => {
    it("accepts a single CREATE TABLE statement with a trailing semicolon", () => {
        expect(assertSingleCreateTable("CREATE TABLE t (id TEXT);")).toBe("CREATE TABLE t (id TEXT);");
    });

    it("rejects empty input", () => {
        expect(() => assertSingleCreateTable("   ")).toThrow(TableSqlError);
    });

    it("rejects non-CREATE TABLE statements", () => {
        expect(() => assertSingleCreateTable("SELECT 1")).toThrow(/CREATE TABLE/);
    });

    it("rejects multiple statements", () => {
        expect(() => assertSingleCreateTable("CREATE TABLE a (x TEXT); DROP TABLE a")).toThrow(
            /exactly one statement/,
        );
    });

    it("ignores semicolons inside string literals and comments", () => {
        const sql = "CREATE TABLE t (\n  -- comment; with semicolon\n  id TEXT DEFAULT 'a;b'\n)";
        expect(assertSingleCreateTable(sql)).toBe(sql);
    });

    it("rejects schema-qualified table names", () => {
        expect(() => assertSingleCreateTable("CREATE TABLE public.t (id TEXT)")).toThrow(/Schema-qualified/);
    });
});

describe("parseCreateTable (PGlite introspection)", () => {
    it("returns columns with types, nullability and primary key", async () => {
        const parsed = await parseCreateTable(
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN, points INTEGER)",
        );
        expect(parsed.tableName).toBe("tasks");
        expect(parsed.columns.map((c) => c.name)).toEqual(["id", "title", "done", "points"]);
        const byName = Object.fromEntries(parsed.columns.map((c) => [c.name, c]));
        expect(byName.id.isPrimaryKey).toBe(true);
        expect(byName.id.isNullable).toBe(false);
        expect(byName.title.isNullable).toBe(false);
        expect(byName.done.kind).toBe("boolean");
        expect(byName.points.kind).toBe("integer");
    });

    it("extracts select options from CHECK (col IN (...)) constraints", async () => {
        const parsed = await parseCreateTable(
            "CREATE TABLE t (id TEXT PRIMARY KEY, status TEXT CHECK (status IN ('open', 'done')))",
        );
        const status = parsed.columns.find((c) => c.name === "status");
        expect(status?.checkOptions).toEqual(["open", "done"]);
    });

    it("rejects invalid SQL with a schema error", async () => {
        await expect(parseCreateTable("CREATE TABLE t (id NOSUCHTYPE)")).rejects.toMatchObject({
            kind: "schema",
        });
    });

    it("does not leak the validated table into later validations", async () => {
        await parseCreateTable("CREATE TABLE dup (id TEXT PRIMARY KEY)");
        await expect(parseCreateTable("CREATE TABLE dup (id TEXT PRIMARY KEY)")).resolves.toMatchObject({
            tableName: "dup",
        });
    });
});

describe("extractCheckInOptions", () => {
    it("parses the ANY(ARRAY[...]) form Postgres normalizes IN lists to", () => {
        const def = "CHECK ((status = ANY (ARRAY['open'::text, 'done'::text])))";
        expect(extractCheckInOptions(def)).toEqual({ column: "status", options: ["open", "done"] });
    });

    it("returns undefined for other CHECK expressions", () => {
        expect(extractCheckInOptions("CHECK ((points > 0))")).toBeUndefined();
    });

    it("unescapes doubled quotes in literals", () => {
        const def = "CHECK ((label = ANY (ARRAY['it''s'::text])))";
        expect(extractCheckInOptions(def)).toEqual({ column: "label", options: ["it's"] });
    });
});

describe("columnKindFromDataType", () => {
    it("maps common Postgres types to kinds", () => {
        expect(columnKindFromDataType("text")).toBe("text");
        expect(columnKindFromDataType("character varying")).toBe("text");
        expect(columnKindFromDataType("integer")).toBe("integer");
        expect(columnKindFromDataType("numeric")).toBe("number");
        expect(columnKindFromDataType("boolean")).toBe("boolean");
        expect(columnKindFromDataType("date")).toBe("date");
        expect(columnKindFromDataType("timestamp without time zone")).toBe("timestamp");
    });
});

describe("diffSchemas", () => {
    it("reports added, removed and type-changed columns", async () => {
        const prev = await parseCreateTable("CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT, b INTEGER)");
        const next = await parseCreateTable("CREATE TABLE t (id TEXT PRIMARY KEY, b TEXT, c DATE)");
        const diff = diffSchemas(prev, next);
        expect(diff.addedColumns).toEqual(["c"]);
        expect(diff.removedColumns).toEqual(["a"]);
        expect(diff.typeChangedColumns).toEqual([{ name: "b", from: "integer", to: "text" }]);
    });

    it("treats everything as added when there is no previous schema", async () => {
        const next = await parseCreateTable("CREATE TABLE t (id TEXT PRIMARY KEY)");
        expect(diffSchemas(undefined, next).addedColumns).toEqual(["id"]);
    });
});
