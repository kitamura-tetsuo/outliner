import { describe, expect, it } from "vitest";

import type { SqlCatalogSnapshot } from "$shared/services/sqlCatalog";
import { compileSqlEnvironment } from "$shared/services/sqlEnvironmentCompiler";
import { introspectTable } from "./schemaIntrospection";
import { castValueForColumn } from "./valueCasting";

describe("runtime ENUM serialization", () => {
    it("includes a valid zero-label ENUM in executable catalog metadata", async () => {
        const built = await compileSqlEnvironment({
            catalog: {
                projectId: "empty-enum-runtime",
                format: 1,
                revision: "empty-enum-v1",
                objects: [{ id: "empty-enum", kind: "enum", source: "CREATE TYPE empty_mood AS ENUM ()" }],
            },
            tables: [{
                id: "tasks-table",
                schema: "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)",
                records: [{ id: "one", values: { id: "one", title: "Existing task" } }],
            }],
            inspections: [],
        });
        expect(built.status, built.status === "failed" ? JSON.stringify(built.diagnostics) : "").toBe("ready");
        if (built.status !== "ready") return;
        try {
            expect(built.environment.enums).toEqual([{
                objectId: "empty-enum",
                schema: "public",
                name: "empty_mood",
                identity: '"public"."empty_mood"',
                labels: [],
            }]);
            await expect(built.environment.query("SELECT title FROM tasks")).resolves.toMatchObject({
                rows: [{ title: "Existing task" }],
            });
        } finally {
            await built.environment.dispose();
        }
    }, 30_000);

    it("uses real catalog metadata to preserve exact labels and reject unknown values", async () => {
        const source = "CREATE TYPE state_level AS ENUM ('', ' waiting ', 'Done')";
        const catalog: SqlCatalogSnapshot = {
            projectId: "runtime-project",
            format: 1,
            revision: "runtime-enum-v1",
            objects: [{ id: "state-enum", kind: "enum", source }],
        };
        const schema = "CREATE TABLE runtime_values (id text PRIMARY KEY, state state_level)";
        const built = await compileSqlEnvironment({
            catalog,
            tables: [{
                id: "runtime-table",
                schema,
                records: [
                    { id: "empty", values: { id: "empty", state: "" } },
                    { id: "space", values: { id: "space", state: " waiting " } },
                    { id: "null", values: { id: "null", state: null } },
                ],
            }],
            inspections: [],
        });
        expect(built.status).toBe("ready");
        if (built.status !== "ready") return;

        const runtimeSchema = await introspectTable(built.environment.db, "public", schema);
        const stateColumn = runtimeSchema.columns.find(column => column.name === "state");
        expect(stateColumn).toEqual(expect.objectContaining({
            kind: "enum",
            enumLabels: ["", " waiting ", "Done"],
        }));
        if (!stateColumn) return;
        expect(castValueForColumn("", stateColumn)).toBe("");
        expect(castValueForColumn(" waiting ", stateColumn)).toBe(" waiting ");
        expect(castValueForColumn(null, stateColumn)).toBeNull();
        expect(() => castValueForColumn("waiting", stateColumn)).toThrow(/ENUM label/);

        const stored = await built.environment.query<{ id: string; state: string | null; }>(
            "SELECT id, state FROM runtime_values ORDER BY id",
        );
        expect(stored.rows).toEqual([
            { id: "empty", state: "" },
            { id: "null", state: null },
            { id: "space", state: " waiting " },
        ]);
        await built.environment.dispose();
    }, 30_000);
});
