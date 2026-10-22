import { afterAll, describe, expect, it } from "vitest";
import { enqueueWrite, resetPgliteForTests } from "./pgliteService";
import { introspectTable, parseCreateTable } from "./schemaIntrospection";

afterAll(async () => await resetPgliteForTests());

describe("catalog-resolved literal DEFAULT casts", () => {
    it("resolves qualified built-ins, UUIDs and quoted catalog ENUMs", async () => {
        const parsed = await parseCreateTable(
            `CREATE TABLE target (
                id TEXT PRIMARY KEY,
                state "state ""日本" DEFAULT 'Done' NOT NULL,
                token UUID DEFAULT '550e8400-e29b-41d4-a716-446655440000'::uuid,
                count INTEGER DEFAULT ('12'::text)::pg_catalog.int4,
                amount NUMERIC(5,2) DEFAULT '1.25'::numeric(5,2),
                label VARCHAR(4) DEFAULT 'done'::varchar(4),
                day DATE DEFAULT (NULL::text)::date,
                scheduled TIMESTAMP DEFAULT (NULL::text)::timestamp
            )`,
            [`CREATE TYPE "state ""日本" AS ENUM ('Open', 'Done')`],
        );
        expect(Object.fromEntries(parsed.columns.slice(1).map(column => [column.name, column.literalDefault]))).toEqual(
            {
                state: { status: "literal", value: "Done" },
                token: { status: "literal", value: "550e8400-e29b-41d4-a716-446655440000" },
                count: { status: "literal", value: 12 },
                amount: { status: "literal", value: 1.25 },
                label: { status: "literal", value: "done" },
                day: { status: "literal", value: null },
                scheduled: { status: "literal", value: null },
            },
        );
        expect(parsed.columns[1]?.enumLabels).toEqual(["Open", "Done"]);
    });

    it("refuses unsupported physical and intermediate types before evaluating defaults", async () => {
        await enqueueWrite(async db => {
            const schema = "unsupported_default_cast_test";
            const createSql = `CREATE TABLE target (
                id TEXT PRIMARY KEY,
                domain_value positive_number DEFAULT 3,
                domain_text TEXT DEFAULT ('3'::positive_number)::text,
                array_text TEXT DEFAULT ('{1,2}'::integer[])::text,
                range_text TEXT DEFAULT ('[1,3)'::int4range)::text,
                composite_text TEXT DEFAULT ('(1)'::scalar_record)::text
            )`;
            await db.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
                CREATE DOMAIN positive_number AS integer CHECK (VALUE > 0);
                CREATE TYPE scalar_record AS (value integer);
                ${createSql}; RESET search_path;`);
            const evaluations: string[] = [];
            try {
                const parsed = await introspectTable(
                    {
                        exec: sql => db.exec(sql),
                        query: async <T>(sql: string, params?: unknown[]) => {
                            // Observe actual engine calls without replacing PostgreSQL's result.
                            if (sql.startsWith("SELECT (") && sql.endsWith(") AS value")) evaluations.push(sql);
                            return await db.query<T>(sql, params);
                        },
                    },
                    schema,
                    createSql,
                );
                expect(parsed.columns.slice(1).map(column => [column.name, column.literalDefault?.status])).toEqual([
                    ["domain_value", "unsupported"],
                    ["domain_text", "unsupported"],
                    ["array_text", "unsupported"],
                    ["range_text", "unsupported"],
                    ["composite_text", "unsupported"],
                ]);
                expect(evaluations).toEqual([]);
                expect((await db.query(`SELECT * FROM ${schema}.target`)).rows).toEqual([]);
            } finally {
                await db.exec(`DROP SCHEMA ${schema} CASCADE; RESET search_path;`);
            }
        });
    });
});
