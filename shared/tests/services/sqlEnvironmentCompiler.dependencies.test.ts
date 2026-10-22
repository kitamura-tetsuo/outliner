import { describe, expect, it } from "vitest";

import type { SqlCatalogSnapshot } from "../../src/services/sqlCatalog";
import {
    analyzeScopedSqlEnumDependencies,
    compileSqlEnvironment,
    type SqlInspectionTarget,
} from "../../src/services/sqlEnvironmentCompiler";

const catalog: SqlCatalogSnapshot = Object.freeze({
    projectId: "dependency-project",
    format: 1,
    revision: "priority-v1",
    objects: Object.freeze([{
        id: "priority-enum",
        kind: "enum",
        source: "CREATE TYPE priority_level AS ENUM ('high', 'low')",
    }]),
});

describe("SQL inspection ENUM dependencies", () => {
    it("rejects ENUM-array casts for Grid, Calendar and Schedule inspections", async () => {
        const kinds = ["grid", "calendar", "schedule"] as const;
        for (const kind of kinds) {
            const result = await compileSqlEnvironment({
                catalog,
                tables: [],
                inspections: [{
                    id: `${kind}-array`,
                    kind,
                    sql: "SELECT ARRAY['high']::priority_level[] AS priorities",
                }],
            });
            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.diagnostics).toEqual(expect.arrayContaining([
                    expect.objectContaining({
                        kind: "unsupported",
                        objectId: `${kind}-array`,
                        message: expect.stringContaining("ENUM array"),
                    }),
                ]));
            }
        }
    }, 30_000);

    it("finds typed-column dependencies in SELECT, filtering and ordering without casts", async () => {
        const inspections: SqlInspectionTarget[] = [
            { id: "grid", kind: "grid", sql: "SELECT priority FROM tasks" },
            { id: "calendar", kind: "calendar", sql: "SELECT id FROM tasks WHERE priority = 'high'" },
            { id: "schedule", kind: "schedule", sql: "SELECT id FROM tasks ORDER BY priority" },
        ];
        const result = await compileSqlEnvironment({
            catalog,
            tables: [{
                id: "tasks-table",
                schema: "CREATE TABLE tasks (id text, priority priority_level)",
                records: [{ id: "one", values: { id: "one", priority: "high" } }],
            }],
            inspections,
        });
        expect(result.status).toBe("ready");
        if (result.status !== "ready") return;
        for (const target of inspections) {
            expect(result.environment.dependencies).toContainEqual({
                referencingId: target.id,
                sourceKind: target.kind,
                status: "complete",
                requiredEnums: [{ objectId: "priority-enum", identity: '"public"."priority_level"' }],
            });
        }
        await result.environment.dispose();
    }, 30_000);

    it("finds qualified ENUM columns through CTE and derived-table scopes", async () => {
        const inspections: SqlInspectionTarget[] = [
            {
                id: "cte",
                kind: "grid",
                sql: "WITH renamed AS (SELECT priority AS value FROM tasks) SELECT value FROM renamed",
            },
            { id: "derived", kind: "calendar", sql: "SELECT value FROM (SELECT priority AS value FROM tasks) nested" },
        ];
        const result = await compileSqlEnvironment({
            catalog,
            tables: [{ id: "tasks-table", schema: "CREATE TABLE tasks (priority public.priority_level)", records: [] }],
            inspections,
        });
        expect(result.status).toBe("ready");
        if (result.status !== "ready") return;
        for (const target of inspections) {
            expect(result.environment.dependencies).toContainEqual({
                referencingId: target.id,
                sourceKind: target.kind,
                status: "complete",
                requiredEnums: [{ objectId: "priority-enum", identity: '"public"."priority_level"' }],
            });
        }
        await result.environment.dispose();
    }, 30_000);

    it("resolves a physical Table inside a same-name non-recursive CTE", async () => {
        const input = {
            catalog,
            tables: [{ id: "tasks-table", schema: "CREATE TABLE tasks (state priority_level)", records: [] }],
            inspections: [{
                id: "same-name-cte",
                kind: "grid" as const,
                sql: "WITH tasks AS (SELECT state FROM tasks) SELECT state FROM tasks",
            }],
        };
        const compiled = await compileSqlEnvironment(input);
        expect(compiled.status).toBe("ready");
        if (compiled.status === "ready") {
            expect(compiled.environment.dependencies).toContainEqual({
                referencingId: "same-name-cte",
                sourceKind: "grid",
                status: "complete",
                requiredEnums: [{ objectId: "priority-enum", identity: '"public"."priority_level"' }],
            });
            await compiled.environment.dispose();
        }

        const scoped = await analyzeScopedSqlEnumDependencies(input, new Set(["same-name-cte"]));
        expect(scoped.status).toBe("complete");
        if (scoped.status === "complete") {
            expect(scoped.scopedInput.tables.map(table => table.id)).toEqual(["tasks-table"]);
            expect(scoped.dependencies[0].requiredEnums).toEqual([
                { objectId: "priority-enum", identity: '"public"."priority_level"' },
            ]);
        }
    }, 30_000);

    it("keeps nested CTE shadowing local to its SELECT scope", async () => {
        const nestedSql = "SELECT state FROM tasks WHERE EXISTS "
            + "(WITH tasks AS (SELECT 1 AS value) SELECT value FROM tasks)";
        const input = {
            catalog,
            tables: [{ id: "tasks-table", schema: "CREATE TABLE tasks (state priority_level)", records: [] }],
            inspections: [
                { id: "nested", kind: "grid" as const, sql: nestedSql },
                {
                    id: "shadowed",
                    kind: "grid" as const,
                    sql: "WITH tasks AS (SELECT 1 AS state) SELECT state FROM tasks",
                },
                {
                    id: "qualified",
                    kind: "grid" as const,
                    sql: "WITH tasks AS (SELECT 1 AS state) SELECT state FROM public.tasks",
                },
            ],
        };
        const compiled = await compileSqlEnvironment(input);
        expect(compiled.status).toBe("ready");
        if (compiled.status === "ready") {
            expect(compiled.environment.dependencies).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    referencingId: "nested",
                    requiredEnums: [{ objectId: "priority-enum", identity: '"public"."priority_level"' }],
                }),
                expect.objectContaining({ referencingId: "shadowed", requiredEnums: [] }),
                expect.objectContaining({
                    referencingId: "qualified",
                    requiredEnums: [{ objectId: "priority-enum", identity: '"public"."priority_level"' }],
                }),
            ]));
            await compiled.environment.dispose();
        }

        const scoped = await analyzeScopedSqlEnumDependencies(
            { ...input, inspections: [input.inspections[0]] },
            new Set([
                "nested",
            ]),
        );
        expect(scoped.status).toBe("complete");
        if (scoped.status === "complete") {
            expect(scoped.scopedInput.tables.map(table => table.id)).toEqual(["tasks-table"]);
            expect(scoped.requiredEnums.map(item => item.objectId)).toEqual(["priority-enum"]);
        }
    }, 30_000);

    it("withholds complete evidence when engine inspection resolution fails", async () => {
        for (const sql of ["SELECT NULL::absent_type", "SELECT missing_column FROM plain_table"]) {
            const result = await compileSqlEnvironment({
                catalog: { ...catalog, objects: [] },
                tables: sql.includes("plain_table")
                    ? [{ id: "plain", schema: "CREATE TABLE plain_table (value text)", records: [] }]
                    : [],
                inspections: [{ id: "unresolved", kind: "grid", sql }],
            });
            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.dependencies).toContainEqual(expect.objectContaining({
                    referencingId: "unresolved",
                    status: "incomplete",
                }));
                expect(result.dependencies).not.toContainEqual(expect.objectContaining({
                    referencingId: "unresolved",
                    status: "complete",
                }));
            }
        }
    }, 30_000);

    it("rejects PostgreSQL's internal ENUM-array type name for every inspection kind", async () => {
        for (const kind of ["grid", "calendar", "schedule"] as const) {
            const result = await compileSqlEnvironment({
                catalog,
                tables: [],
                inspections: [{
                    id: `${kind}-internal-array`,
                    kind,
                    sql: "SELECT ARRAY['high']::public._priority_level",
                }],
            });
            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.diagnostics).toContainEqual(expect.objectContaining({
                    kind: "unsupported",
                    objectId: `${kind}-internal-array`,
                    message: expect.stringContaining("ENUM array"),
                }));
                expect(result.dependencies).not.toContainEqual(expect.objectContaining({
                    referencingId: `${kind}-internal-array`,
                    status: "complete",
                }));
            }
        }
    }, 30_000);
});
