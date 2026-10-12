import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import type { SqlCatalogSnapshot } from "../../src/services/sqlCatalog";
import { compileSqlEnvironment, type SqlEnvironmentInput } from "../../src/services/sqlEnvironmentCompiler";

const emptyCatalog: SqlCatalogSnapshot = Object.freeze({
    projectId: "project",
    format: 1,
    revision: "same-catalog-revision",
    objects: Object.freeze([]),
});

function input(
    schema: string,
    value: string,
    sql: string,
    kind: "grid" | "calendar" | "schedule" = "grid",
): SqlEnvironmentInput {
    return {
        catalog: emptyCatalog,
        tables: [{ id: "table", schema, records: [{ id: "record", values: { id: value } }] }],
        inspections: [{ id: "grid", kind, sql }],
    };
}

describe("SQL environment input provenance", () => {
    it("binds descriptors to schema, records, inspection kind and inspection SQL", async () => {
        const db = new PGlite("memory://");
        const options = { acquire: async () => ({ db, release: () => {} }) };
        const baselineInput = input("CREATE TABLE tasks (id text)", "high", "SELECT id FROM tasks");
        const recordInput = input("CREATE TABLE tasks (id text)", "low", "SELECT id FROM tasks");
        const schemaInput = input("CREATE TABLE tasks (id varchar(10))", "high", "SELECT id FROM tasks");
        const sqlInput = input("CREATE TABLE tasks (id text)", "high", "SELECT id FROM tasks ORDER BY id", "calendar");

        const descriptors = [];
        for (const candidate of [baselineInput, recordInput, schemaInput, sqlInput]) {
            const result = await compileSqlEnvironment(candidate, options);
            expect(result.status).toBe("ready");
            if (result.status !== "ready") return;
            descriptors.push(result.environment.descriptor);
            await result.environment.dispose();
        }
        expect(descriptors[0]?.tables).toEqual(baselineInput.tables);
        expect(descriptors[1]?.tables).toEqual(recordInput.tables);
        expect(descriptors[2]?.tables).toEqual(schemaInput.tables);
        expect(descriptors[3]?.inspections).toEqual(sqlInput.inspections);
        expect(new Set(descriptors.map(descriptor => JSON.stringify(descriptor))).size).toBe(4);
        await db.close();
    }, 60_000);

    it("rejects duplicate requested SQL names even when IF NOT EXISTS would hide the second schema", async () => {
        const result = await compileSqlEnvironment({
            catalog: emptyCatalog,
            tables: [
                { id: "a", schema: "CREATE TABLE tasks (id text)", records: [] },
                {
                    id: "b",
                    schema: "CREATE TABLE IF NOT EXISTS tasks (id text, priority missing_enum)",
                    records: [],
                },
            ],
            inspections: [],
        });
        expect(result.status).toBe("failed");
        if (result.status === "failed") {
            expect(result.diagnostics).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    kind: "schema",
                    objectId: "b",
                    message: expect.stringContaining("Duplicate"),
                }),
            ]));
        }
    });
});
