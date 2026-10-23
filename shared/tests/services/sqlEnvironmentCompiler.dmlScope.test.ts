import { describe, expect, it } from "vitest";
import {
    analyzeScopedSqlEnumDependencies,
    type SqlEnvironmentInput,
    structuralSqlRelationReferences,
} from "../../src/services/sqlEnvironmentCompiler";

const input: SqlEnvironmentInput = {
    catalog: {
        projectId: "dml-scope",
        format: 1,
        revision: "dml-scope-v1",
        objects: [{ id: "mood-id", kind: "enum", source: "CREATE TYPE mood AS ENUM ('happy', 'sad')" }],
    },
    tables: [{ id: "tasks-id", schema: "CREATE TABLE tasks (id text, state public.mood)", records: [] }],
    inspections: [],
};

describe("physical DML targets in CTE scopes", () => {
    it.each([
        "WITH tasks AS (SELECT 'new' AS id) INSERT INTO tasks (id, state) SELECT id, 'happy' FROM tasks RETURNING state",
        "WITH tasks AS (SELECT 'old' AS id) UPDATE tasks SET state = 'sad' WHERE id IN (SELECT id FROM tasks) RETURNING state",
        "WITH tasks AS (SELECT 'old' AS id) DELETE FROM tasks WHERE id IN (SELECT id FROM tasks) RETURNING state",
    ])("retains the unselected target's implicit ENUM evidence: %s", async sql => {
        expect(structuralSqlRelationReferences(sql)).toEqual([{ schema: undefined, name: "tasks" }]);
        const result = await analyzeScopedSqlEnumDependencies({
            ...input,
            inspections: [{ id: "schedule", kind: "schedule", sql }],
        }, new Set(["schedule"]));

        expect(result.status).toBe("complete");
        if (result.status !== "complete") return;
        expect(result.scopedInput.tables.map(table => table.id)).toEqual(["tasks-id"]);
        expect(result.dependencies).toEqual([{
            referencingId: "schedule",
            sourceKind: "schedule",
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
});
