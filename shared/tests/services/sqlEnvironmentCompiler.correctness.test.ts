import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import type { SqlCatalogSnapshot } from "../../src/services/sqlCatalog";
import {
    compileSqlEnvironment,
    type SqlEnvironmentInput,
    type SqlEnvironmentLease,
} from "../../src/services/sqlEnvironmentCompiler";

function catalog(source?: string): SqlCatalogSnapshot {
    return Object.freeze({
        projectId: "plain-project",
        format: 1,
        revision: source ? `enum:${source}` : "empty",
        objects: source
            ? Object.freeze([{ id: "unrelated-enum", kind: "enum" as const, source }])
            : Object.freeze([]),
    });
}

function builtInInput(source?: string): SqlEnvironmentInput {
    return Object.freeze({
        catalog: catalog(source),
        tables: Object.freeze([{
            id: "plain-table",
            schema: "CREATE TABLE plain_values (id text PRIMARY KEY, rank integer, enabled boolean, note text)",
            records: Object.freeze([
                { id: "two", values: { id: "two", rank: 2, enabled: false, note: null } },
                { id: "one", values: { id: "one", rank: 1, enabled: true, note: "" } },
            ]),
        }]),
        inspections: Object.freeze([{
            id: "plain-grid",
            kind: "grid" as const,
            sql: "SELECT id, rank, enabled, note FROM plain_values ORDER BY rank",
        }]),
    });
}

describe("compileSqlEnvironment correctness invariants", () => {
    it("attributes invalid ENUM values to the actual column, never a substring-matching short name", async () => {
        const built = await compileSqlEnvironment({
            catalog: catalog("CREATE TYPE priority_level AS ENUM ('high', 'low')"),
            tables: [{
                id: "tasks",
                schema: "CREATE TABLE tasks (a text, id text PRIMARY KEY, priority priority_level)",
                records: [{ id: "r1", values: { a: "x", id: "r1", priority: "HIGH" } }],
            }],
            inspections: [],
        });

        expect(built.status).toBe("failed");
        if (built.status !== "failed") return;
        expect(built.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "record", recordId: "r1", column: "priority" }),
        ]));
    }, 30_000);

    it("clears TEMP auxiliaries before and after every reused lease", async () => {
        const db = new PGlite("memory://");
        const acquire = async (): Promise<SqlEnvironmentLease> => ({ db, release: () => {} });
        await db.exec("CREATE TEMP TABLE stale_temp (value text); INSERT INTO stale_temp VALUES ('leaked')");

        const first = await compileSqlEnvironment(builtInInput(), { acquire });
        expect(first.status).toBe("ready");
        if (first.status !== "ready") {
            await db.close();
            return;
        }
        const staleDuringCandidate = await first.environment.query<{ count: number; }>(
            "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                + "WHERE n.nspname LIKE 'pg_temp_%' AND c.relname='stale_temp'",
        );
        expect(staleDuringCandidate.rows).toEqual([{ count: 0 }]);
        await db.exec("CREATE TEMP TABLE candidate_temp (value text)");
        await first.environment.dispose();

        const residue = await db.query<{ count: number; }>(
            "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                + "WHERE n.nspname LIKE 'pg_temp_%' AND c.relname='candidate_temp'",
        );
        expect(residue.rows).toEqual([{ count: 0 }]);

        const temporaryInput = builtInInput();
        const rejected = await compileSqlEnvironment({
            ...temporaryInput,
            tables: [{ ...temporaryInput.tables[0], schema: "CREATE TEMP TABLE plain_values (id text)" }],
        }, { acquire });
        expect(rejected.status).toBe("failed");
        if (rejected.status === "failed") {
            expect(rejected.diagnostics).toEqual(expect.arrayContaining([
                expect.objectContaining({ kind: "schema", message: "Temporary tables are not supported" }),
            ]));
        }
        await db.close();
    }, 30_000);

    it("keeps built-in validation and query results unchanged by an unrelated ENUM", async () => {
        const emptyCatalog = await compileSqlEnvironment(builtInInput());
        const unrelatedEnum = await compileSqlEnvironment(
            builtInInput("CREATE TYPE unrelated_state AS ENUM ('later', 'earlier')"),
        );
        expect(emptyCatalog.status).toBe("ready");
        expect(unrelatedEnum.status).toBe("ready");
        if (emptyCatalog.status !== "ready" || unrelatedEnum.status !== "ready") return;

        const sql = "SELECT id, rank, enabled, note, pg_typeof(rank)::text AS rank_type, "
            + "pg_typeof(enabled)::text AS enabled_type FROM plain_values ORDER BY rank";
        const withoutEnum = await emptyCatalog.environment.query(sql);
        const withEnum = await unrelatedEnum.environment.query(sql);
        expect(withoutEnum.rows).toEqual([
            { id: "one", rank: 1, enabled: true, note: "", rank_type: "integer", enabled_type: "boolean" },
            { id: "two", rank: 2, enabled: false, note: null, rank_type: "integer", enabled_type: "boolean" },
        ]);
        expect(withEnum.rows).toEqual(withoutEnum.rows);
        expect(emptyCatalog.environment.dependencies).toEqual(unrelatedEnum.environment.dependencies);
        await emptyCatalog.environment.dispose();
        await unrelatedEnum.environment.dispose();
    }, 30_000);
});
