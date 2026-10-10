import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import type { SqlCatalogSnapshot } from "../../src/services/sqlCatalog";
import {
    compileSqlEnvironment,
    type SqlEnvironmentInput,
    type SqlEnvironmentLease,
} from "../../src/services/sqlEnvironmentCompiler";

function input(
    source: string,
    records: SqlEnvironmentInput["tables"][number]["records"] = [],
    inspections: SqlEnvironmentInput["inspections"] = [],
): SqlEnvironmentInput {
    const catalog: SqlCatalogSnapshot = Object.freeze({
        projectId: "project-a",
        format: 1,
        revision: `revision:${source}`,
        objects: Object.freeze([{ id: "enum-priority", kind: "enum", source }]),
    });
    return Object.freeze({
        catalog,
        tables: Object.freeze([{
            id: "table-tasks",
            schema: "CREATE TABLE tasks (id text PRIMARY KEY, priority priority_level, note text)",
            records,
        }]),
        inspections,
    });
}

describe("compileSqlEnvironment", () => {
    it("cold-builds real ENUM metadata and preserves PostgreSQL comparison order", async () => {
        const captured = input(
            "-- declaration; comment\nCREATE TYPE priority_level AS ENUM ('high', ' medium', '', 'low;est');",
            [
                { id: "low", values: { id: "low", priority: "low;est", note: null } },
                { id: "empty", values: { id: "empty", priority: "", note: "" } },
                { id: "high", values: { id: "high", priority: "high", note: "value" } },
                { id: "medium", values: { id: "medium", priority: " medium", note: "value" } },
                { id: "null", values: { id: "null", priority: null, note: "value" } },
            ],
            [{ id: "grid-priority", kind: "grid", sql: "SELECT priority::priority_level AS priority FROM tasks" }],
        );
        const built = await compileSqlEnvironment(captured);
        expect(built.status).toBe("ready");
        if (built.status !== "ready") return;

        expect(built.environment.descriptor).toEqual({
            projectId: "project-a",
            catalogRevision: captured.catalog.revision,
            catalogObjectIds: ["enum-priority"],
            tableIds: ["table-tasks"],
            inspectionIds: ["grid-priority"],
        });
        expect(built.environment.enums).toEqual([{
            objectId: "enum-priority",
            schema: "public",
            name: "priority_level",
            identity: '"public"."priority_level"',
            labels: ["high", " medium", "", "low;est"],
        }]);
        expect(built.environment.dependencies).toEqual([
            {
                referencingId: "table-tasks",
                sourceKind: "table",
                status: "complete",
                requiredEnums: [{ objectId: "enum-priority", identity: '"public"."priority_level"' }],
            },
            {
                referencingId: "grid-priority",
                sourceKind: "grid",
                status: "complete",
                requiredEnums: [{ objectId: "enum-priority", identity: '"public"."priority_level"' }],
            },
        ]);
        const ordered = await built.environment.query<{ id: string; priority: string | null; }>(
            "SELECT id, priority FROM tasks ORDER BY priority ASC NULLS LAST",
        );
        expect(ordered.rows).toEqual([
            { id: "high", priority: "high" },
            { id: "medium", priority: " medium" },
            { id: "empty", priority: "" },
            { id: "low", priority: "low;est" },
            { id: "null", priority: null },
        ]);
        await built.environment.dispose();

        const rebuilt = await compileSqlEnvironment(captured);
        expect(rebuilt.status).toBe("ready");
        if (rebuilt.status === "ready") {
            expect(rebuilt.environment.enums[0]?.labels).toEqual(["high", " medium", "", "low;est"]);
            await rebuilt.environment.dispose();
        }
    }, 30_000);

    it("returns complete record diagnostics and never a partial environment", async () => {
        const built = await compileSqlEnvironment(input(
            "CREATE TYPE priority_level AS ENUM ('high', 'low')",
            [
                { id: "valid", values: { id: "valid", priority: "high", note: "ok" } },
                { id: "invalid-enum", values: { id: "invalid-enum", priority: "HIGH", note: "bad" } },
                { id: "missing-id", values: { priority: "low", note: "bad" } },
            ],
        ));
        expect(built.status).toBe("failed");
        if (built.status !== "failed") return;
        expect(built.diagnostics.filter(diagnostic => diagnostic.kind === "record")).toEqual([
            expect.objectContaining({ recordId: "invalid-enum", column: "priority" }),
            expect.objectContaining({ recordId: "missing-id", column: "id" }),
        ]);
    }, 30_000);

    it.each([
        ["CREATE TYPE priority_level AS ENUM ('high'); SELECT 1", "exactly one statement"],
        ["CREATE DOMAIN priority_level AS text", "CREATE TYPE"],
        ["ALTER TYPE priority_level ADD VALUE 'low'", "CREATE TYPE"],
    ])("rejects catalog scripts before execution: %s", async (source, expected) => {
        const built = await compileSqlEnvironment(input(source));
        expect(built.status).toBe("failed");
        if (built.status === "failed") expect(built.diagnostics[0]?.message).toContain(expected);
    });

    it("rejects built-in type conflicts instead of creating a shadow type", async () => {
        const conflicting = input("CREATE TYPE text AS ENUM ('wrong')");
        const built = await compileSqlEnvironment({ ...conflicting, tables: [], inspections: [] });
        expect(built.status).toBe("failed");
        if (built.status === "failed") expect(built.diagnostics[0]?.message).toContain("built-in type");
    }, 30_000);

    it("rejects unsupported ENUM arrays and unresolved inspection dependencies", async () => {
        const arrayInput = input("CREATE TYPE priority_level AS ENUM ('high')");
        const built = await compileSqlEnvironment({
            ...arrayInput,
            tables: [{ ...arrayInput.tables[0], schema: "CREATE TABLE tasks (id text, priority priority_level[])" }],
            inspections: [{ id: "broken", kind: "schedule", sql: "SELECT * FROM unavailable" }],
        });
        expect(built.status).toBe("failed");
        if (built.status !== "failed") return;
        expect(built.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "unsupported", column: "priority" }),
            expect.objectContaining({ kind: "inspection", objectId: "broken" }),
        ]));
    }, 30_000);

    it("cleans a reused lease between projects and after failed candidates", async () => {
        const db = new PGlite("memory://");
        const acquire = async (): Promise<SqlEnvironmentLease> => ({ db, release: () => {} });
        const first = await compileSqlEnvironment(input("CREATE TYPE priority_level AS ENUM ('first', 'second')"), {
            acquire,
        });
        expect(first.status).toBe("ready");
        if (first.status === "ready") await first.environment.dispose();

        const failed = await compileSqlEnvironment(
            input("CREATE TYPE priority_level AS ENUM ('wrong')", [{
                id: "bad",
                values: { id: "bad", priority: "missing" },
            }]),
            { acquire },
        );
        expect(failed.status).toBe("failed");

        const reversed = await compileSqlEnvironment(input("CREATE TYPE priority_level AS ENUM ('second', 'first')"), {
            acquire,
        });
        expect(reversed.status).toBe("ready");
        if (reversed.status === "ready") {
            expect(reversed.environment.enums[0]?.labels).toEqual(["second", "first"]);
            await reversed.environment.dispose();
        }
        await db.close();
    }, 30_000);

    it("captures records before asynchronous compilation begins", async () => {
        const db = new PGlite("memory://");
        const record = { id: "record", values: { id: "record", priority: "high", note: "captured" } };
        const mutable = input("CREATE TYPE priority_level AS ENUM ('high')", [record]);
        let allowLease!: () => void;
        const leaseGate = new Promise<void>(resolve => allowLease = resolve);
        const compiling = compileSqlEnvironment(mutable, {
            acquire: async () => {
                await leaseGate;
                return { db, release: () => {} };
            },
        });
        record.values.priority = "changed-after-call";
        allowLease();
        const built = await compiling;
        expect(built.status).toBe("ready");
        if (built.status === "ready") {
            const result = await built.environment.query<{ priority: string; }>("SELECT priority FROM tasks");
            expect(result.rows).toEqual([{ priority: "high" }]);
            await built.environment.dispose();
        }
        await db.close();
    }, 30_000);
});
