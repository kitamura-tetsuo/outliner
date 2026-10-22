import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import type { SqlEnvironmentInput } from "../../src/services/sqlEnvironmentCompiler";
import { analyzeScopedSqlEnumDependencies } from "../../src/services/sqlEnvironmentCompiler";

const input: SqlEnvironmentInput = {
    catalog: {
        projectId: "scoped-project",
        format: 1,
        revision: "scoped-v1",
        objects: [
            { id: "mood-id", kind: "enum", source: "CREATE TYPE mood AS ENUM ('happy', 'sad')" },
            { id: "broken", kind: "enum", source: "this is not SQL" },
        ],
    },
    tables: [
        { id: "tasks-id", schema: "CREATE TABLE tasks (id text, state public.mood)", records: [] },
        { id: "plain-id", schema: "CREATE TABLE plain (value text)", records: [] },
        { id: "broken-table", schema: "not a table", records: [] },
        { id: "duplicate-a", schema: "CREATE TABLE duplicate_name (value text)", records: [] },
        { id: "duplicate-b", schema: "CREATE TABLE duplicate_name (value integer)", records: [] },
    ],
    inspections: [
        {
            id: "cte-grid",
            kind: "grid",
            sql: "WITH renamed AS (SELECT state AS value FROM tasks) SELECT value FROM renamed",
        },
        { id: "plain-grid", kind: "grid", sql: "SELECT value FROM plain" },
    ],
};

describe("scoped SQL ENUM dependency analysis", () => {
    it("uses the physical relation closure and ignores unrelated invalid inputs", async () => {
        const result = await analyzeScopedSqlEnumDependencies(input, new Set(["cte-grid"]));
        expect(result.status).toBe("complete");
        if (result.status !== "complete") return;
        expect(result.scopedInput.tables.map(table => table.id)).toEqual(["tasks-id"]);
        expect(result.scopedInput.catalog.objects.map(object => object.id)).toEqual(["mood-id"]);
        expect(result.dependencies).toEqual([{
            referencingId: "cte-grid",
            sourceKind: "grid",
            status: "complete",
            requiredEnums: [{ objectId: "mood-id", identity: '"public"."mood"' }],
        }]);
        expect(result.requiredEnums).toEqual([{
            objectId: "mood-id",
            schema: "public",
            name: "mood",
            identity: '"public"."mood"',
            labels: ["happy", "sad"],
        }]);
    }, 30_000);

    it("proves builtin-only scope empty and rejects missing requests", async () => {
        const plain = await analyzeScopedSqlEnumDependencies(input, new Set(["plain-grid"]));
        expect(plain.status).toBe("complete");
        if (plain.status === "complete") {
            expect(plain.requiredEnums).toEqual([]);
            expect(plain.scopedInput.catalog.objects).toEqual([]);
        }

        const missing = await analyzeScopedSqlEnumDependencies(input, new Set(["missing"]));
        expect(missing.status).toBe("incomplete");
        if (missing.status === "incomplete") {
            expect(missing.diagnostics).toEqual([
                expect.objectContaining({ objectId: "missing", message: expect.stringContaining("does not exist") }),
            ]);
        }
    }, 30_000);

    it("does not let unrelated duplicate relation names contaminate a directly requested Table", async () => {
        const result = await analyzeScopedSqlEnumDependencies(input, new Set(["plain-id"]));
        expect(result.status).toBe("complete");
        if (result.status !== "complete") return;
        expect(result.scopedInput.tables.map(table => table.id)).toEqual(["plain-id"]);
        expect(result.dependencies).toEqual([{
            referencingId: "plain-id",
            sourceKind: "table",
            status: "complete",
            requiredEnums: [],
        }]);
    }, 30_000);

    it("keeps an unresolved custom type explicit", async () => {
        const unresolved: SqlEnvironmentInput = {
            ...input,
            tables: [{ id: "custom", schema: "CREATE TABLE custom_table (value absent_type)", records: [] }],
            inspections: [],
        };
        const result = await analyzeScopedSqlEnumDependencies(unresolved, new Set(["custom"]));
        expect(result.status).toBe("incomplete");
        if (result.status === "incomplete") {
            expect(result.diagnostics).toEqual(expect.arrayContaining([
                expect.objectContaining({ message: expect.stringContaining("absent_type") }),
            ]));
        }
    }, 30_000);

    it("lets PGlite resolve CREATE TABLE pseudo-types without selecting unrelated catalog entries", async () => {
        for (const pseudoType of ["serial", "smallserial", "bigserial"]) {
            const scoped = await analyzeScopedSqlEnumDependencies({
                ...input,
                tables: [{
                    id: "generated",
                    schema: `CREATE TABLE generated (id ${pseudoType} PRIMARY KEY)`,
                    records: [],
                }],
                inspections: [],
            }, new Set(["generated"]));
            expect(scoped.status).toBe("complete");
            if (scoped.status === "complete") {
                expect(scoped.requiredEnums).toEqual([]);
                expect(scoped.scopedInput.catalog.objects).toEqual([]);
            }
        }
    }, 60_000);

    it("releases every temporary engine on complete and incomplete outcomes", async () => {
        let acquired = 0;
        let released = 0;
        const acquire = async () => {
            acquired++;
            const db = new PGlite("memory://");
            return {
                db,
                release: async () => {
                    released++;
                    await db.close();
                },
            };
        };
        expect((await analyzeScopedSqlEnumDependencies(input, new Set(["plain-grid"]), { acquire })).status).toBe(
            "complete",
        );
        expect({ acquired, released }).toEqual({ acquired: 2, released: 2 });

        const failed = await analyzeScopedSqlEnumDependencies(input, new Set(["missing"]), { acquire });
        expect(failed.status).toBe("incomplete");
        expect({ acquired, released }).toEqual({ acquired: 2, released: 2 });
    }, 30_000);
});
