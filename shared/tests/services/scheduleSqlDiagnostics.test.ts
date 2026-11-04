import { describe, expect, it } from "vitest";
import {
    currentScheduleSqlDiagnostic,
    decodeScheduleSqlDiagnostic,
    serializeScheduleSqlDiagnostic,
} from "../../src/services/scheduleSqlDiagnostics";

describe("Schedule SQL diagnostics", () => {
    const sql = "SELECT 1";
    const encoded = serializeScheduleSqlDiagnostic(sql, false, "Query must be an INSERT statement");

    it("returns a rejection only for its exact saved input pair", () => {
        expect(currentScheduleSqlDiagnostic({ sql, sqlValidationDiagnostic: encoded })?.error)
            .toBe("Query must be an INSERT statement");
        expect(currentScheduleSqlDiagnostic({ sql: `${sql} `, sqlValidationDiagnostic: encoded })).toBeUndefined();
        expect(currentScheduleSqlDiagnostic({ sql, sqlAliasPolicyVersion: 1, sqlValidationDiagnostic: encoded }))
            .toBeUndefined();
    });

    it("normalizes policy versions to their effective strict-alias boolean", () => {
        expect(currentScheduleSqlDiagnostic({ sql, sqlAliasPolicyVersion: 2, sqlValidationDiagnostic: encoded }))
            .toBeDefined();
    });

    it("rejects absent, malformed, and unsupported envelopes", () => {
        expect(decodeScheduleSqlDiagnostic(undefined)).toBeUndefined();
        expect(decodeScheduleSqlDiagnostic("not json")).toBeUndefined();
        expect(decodeScheduleSqlDiagnostic(JSON.stringify({ version: 2, sql, strictAliases: false, error: "x" })))
            .toBeUndefined();
    });
});
