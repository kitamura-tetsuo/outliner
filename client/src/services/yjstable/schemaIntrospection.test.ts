import { afterAll, describe, expect, it } from "vitest";
import { enqueueWrite, resetPgliteForTests, TableSqlError } from "./pgliteService";
import {
    assertSingleCreateTable,
    columnKindFromDataType,
    diffSchemas,
    extractCheckInOptions,
    introspectTable,
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

    it.each(["CREATE TEMP TABLE t (id TEXT)", "CREATE UNLOGGED TABLE t (id TEXT)", "CREATE TABLE t AS SELECT 1"])(
        "rejects unsupported CREATE TABLE modes: %s",
        sql => expect(() => assertSingleCreateTable(sql)).toThrow(TableSqlError),
    );

    it("rejects malformed SQL without executing it", () => {
        expect(() => assertSingleCreateTable("CREATE TABLE t (value TEXT /* unterminated")).toThrow(TableSqlError);
    });
});

describe("parseCreateTable (PGlite introspection)", () => {
    it.each([
        ["id TEXT, title TEXT", []],
        ["title TEXT, id TEXT PRIMARY KEY", ["id"]],
        ["id TEXT, title TEXT PRIMARY KEY", ["title"]],
        ["code TEXT, id TEXT, title TEXT, PRIMARY KEY (title, code)", ["code", "title"]],
        ["title TEXT, id TEXT, PRIMARY KEY (id, title)", ["id", "title"]],
    ])("reports the actual primary-key members independently of column order: %s", async (fields, key) => {
        const parsed = await parseCreateTable(`CREATE TABLE t (${fields})`);
        expect(parsed.columns.filter(column => column.isPrimaryKey).map(column => column.name).sort()).toEqual(key);
        expect(parsed.hasAdditionalUniqueConstraint).toBe(false);
    });

    it.each([
        ["title TEXT", false, false],
        ["title TEXT UNIQUE", false, true],
        ["title TEXT, code TEXT, UNIQUE (title, code)", false, true],
        ["title TEXT, derived TEXT GENERATED ALWAYS AS (upper(title)) STORED", true, false],
    ])("exposes INSERT restrictions without rejecting the valid schema: %s", async (fields, generated, unique) => {
        const parsed = await parseCreateTable(`CREATE TABLE t (id TEXT PRIMARY KEY, ${fields})`);
        expect(parsed.columns[0]?.isPrimaryKey).toBe(true);
        expect(parsed.hasGeneratedColumns).toBe(generated);
        expect(parsed.hasAdditionalUniqueConstraint).toBe(unique);
    });

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

    it("publishes only whole-expression finite text checks", async () => {
        const supported = await parseCreateTable(
            `CREATE TABLE t (id TEXT, "状態" TEXT CHECK ("状態" IN ('進行中', 'it''s];')))`,
        );
        expect(supported.columns[1]?.checkOptions).toEqual(["進行中", "it's];"]);
        expect(supported.hasUnsupportedInsertCheck).toBe(false);

        const unsupported = await parseCreateTable(
            "CREATE TABLE t (id TEXT, status TEXT CHECK (status IN ('open', 'done') AND length(status) > 0))",
        );
        expect(unsupported.columns[1]?.checkOptions).toBeUndefined();
        expect(unsupported.hasUnsupportedInsertCheck).toBe(true);
    });

    it("resolves static defaults and marks dynamic defaults unsupported without evaluating them", async () => {
        const parsed = await parseCreateTable(
            "CREATE TABLE t (id TEXT, label TEXT DEFAULT 'it''s', count INTEGER DEFAULT -2, active BOOLEAN DEFAULT true, dynamic TEXT DEFAULT gen_random_uuid()::text)",
        );
        expect(parsed.columns.map(column => column.literalDefault)).toEqual([
            undefined,
            { status: "literal", value: "it's" },
            { status: "literal", value: -2 },
            { status: "literal", value: true },
            { status: "unsupported", diagnostic: "DEFAULT is not a supported scalar literal" },
        ]);
    });

    it("does not issue value-evaluation queries for dynamic temporal casts", async () => {
        await enqueueWrite(async db => {
            const schema = "dynamic_temporal_default_test";
            const createSql =
                "CREATE TABLE t (id TEXT, at TIMESTAMP DEFAULT ('now'::text)::timestamp, day DATE DEFAULT ('today'::text)::date)";
            await db.exec(
                `DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}; SET search_path TO ${schema}; ${createSql}`,
            );
            const evaluations: string[] = [];
            try {
                const parsed = await introspectTable(
                    {
                        exec: sql => db.exec(sql),
                        query: async <T>(sql: string, params?: unknown[]) => {
                            if (/^SELECT \(/.test(sql) && /\) AS value$/.test(sql)) evaluations.push(sql);
                            return await db.query<T>(sql, params);
                        },
                    },
                    schema,
                    createSql,
                );
                expect(parsed.columns.slice(1).map(column => column.literalDefault?.status)).toEqual([
                    "unsupported",
                    "unsupported",
                ]);
                expect(evaluations).toEqual([]);
            } finally {
                await db.exec(`DROP SCHEMA IF EXISTS ${schema} CASCADE; SET search_path TO public`);
            }
        });
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
        const def = "(status = ANY (ARRAY['open'::text, 'done'::text]))";
        expect(extractCheckInOptions(def)).toEqual({ column: "status", options: ["open", "done"] });
    });

    it("returns undefined for other CHECK expressions", () => {
        expect(extractCheckInOptions("(points > 0)")).toBeUndefined();
    });

    it("unescapes doubled quotes in literals", () => {
        const def = "(label = ANY (ARRAY['it''s'::text]))";
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
