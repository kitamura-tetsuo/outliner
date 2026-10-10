import { describe, expect, it } from "vitest";

import type { SqlCatalogSnapshot } from "../../src/services/sqlCatalog";
import { compileSqlEnvironment, type SqlInspectionTarget } from "../../src/services/sqlEnvironmentCompiler";

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
});
