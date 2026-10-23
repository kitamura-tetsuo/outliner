import { expect, it } from "vitest";
import { compileSqlEnvironment, type SqlEnvironmentInput } from "../../src/services/sqlEnvironmentCompiler";

it("compiles referenced Tables and records before their dependants without reordering the descriptor", async () => {
    const input: SqlEnvironmentInput = {
        catalog: {
            projectId: "foreign-key-project",
            format: 1,
            revision: "v1",
            objects: [{ id: "mood-id", kind: "enum", source: "CREATE TYPE mood AS ENUM ('happy', 'sad')" }],
        },
        tables: [
            {
                id: "child-id",
                schema: "CREATE TABLE child (id text PRIMARY KEY, state mood REFERENCES public.parent(state))",
                records: [{ id: "child", values: { id: "child", state: "happy" } }],
            },
            {
                id: "parent-id",
                schema: "CREATE TABLE parent (state mood PRIMARY KEY)",
                records: [{ id: "parent", values: { state: "happy" } }],
            },
        ],
        inspections: [{ id: "grid-id", kind: "grid", sql: "SELECT state AS state FROM child" }],
    };
    const built = await compileSqlEnvironment(input);
    expect(built.status, built.status === "failed" ? JSON.stringify(built.diagnostics) : undefined).toBe("ready");
    if (built.status !== "ready") return;
    try {
        expect(built.environment.descriptor.tables).toEqual(input.tables);
        expect(built.environment.dependencies.find(row => row.referencingId === "grid-id")).toEqual({
            referencingId: "grid-id",
            sourceKind: "grid",
            status: "complete",
            requiredEnums: [{ objectId: "mood-id", identity: '"public"."mood"' }],
        });
        expect(
            (await built.environment.query("SELECT child.id, parent.state FROM child JOIN parent USING (state)")).rows,
        )
            .toEqual([{ id: "child", state: "happy" }]);
    } finally {
        await built.environment.dispose();
    }
}, 30_000);
