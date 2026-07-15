import { describe, expect, it } from "vitest";
import { TableSqlError } from "./pgliteService";
import type { TableColumnSchema } from "./schemaIntrospection";
import { castValueForColumn } from "./valueCasting";

function col(kind: TableColumnSchema["kind"], dataType: string = kind): TableColumnSchema {
    return { name: "c", dataType, kind, isNullable: true, isPrimaryKey: false };
}

describe("castValueForColumn", () => {
    it("passes strings through for text columns and stringifies primitives", () => {
        expect(castValueForColumn("hello", col("text"))).toBe("hello");
        expect(castValueForColumn(42, col("text"))).toBe("42");
        expect(castValueForColumn(true, col("text"))).toBe("true");
    });

    it("maps null, undefined and empty non-text strings to null", () => {
        expect(castValueForColumn(null, col("integer"))).toBeNull();
        expect(castValueForColumn(undefined, col("text"))).toBeNull();
        expect(castValueForColumn("", col("integer"))).toBeNull();
        expect(castValueForColumn("", col("text"))).toBe("");
    });

    it("casts integers strictly", () => {
        expect(castValueForColumn(3, col("integer"))).toBe(3);
        expect(castValueForColumn("12", col("integer"))).toBe(12);
        expect(() => castValueForColumn(3.5, col("integer"))).toThrow(TableSqlError);
        expect(() => castValueForColumn("3.5", col("integer"))).toThrow(TableSqlError);
        expect(() => castValueForColumn("abc", col("integer"))).toThrow(TableSqlError);
    });

    it("casts numbers strictly", () => {
        expect(castValueForColumn(3.5, col("number", "numeric"))).toBe(3.5);
        expect(castValueForColumn("2.25", col("number", "numeric"))).toBe(2.25);
        expect(() => castValueForColumn(Number.NaN, col("number", "numeric"))).toThrow(TableSqlError);
        expect(() => castValueForColumn("x", col("number", "numeric"))).toThrow(TableSqlError);
    });

    it("casts booleans strictly", () => {
        expect(castValueForColumn(true, col("boolean"))).toBe(true);
        expect(castValueForColumn("false", col("boolean"))).toBe(false);
        expect(() => castValueForColumn(1, col("boolean"))).toThrow(TableSqlError);
        expect(() => castValueForColumn("yes", col("boolean"))).toThrow(TableSqlError);
    });

    it("validates dates and timestamps", () => {
        expect(castValueForColumn("2026-07-13", col("date"))).toBe("2026-07-13");
        expect(() => castValueForColumn("2026-02-30", col("date"))).toThrow(TableSqlError);
        expect(() => castValueForColumn("13/07/2026", col("date"))).toThrow(TableSqlError);
        expect(castValueForColumn("2026-07-13T09:30", col("timestamp"))).toBe("2026-07-13T09:30");
        expect(castValueForColumn("2026-07-13 09:30:15", col("timestamp"))).toBe("2026-07-13 09:30:15");
        expect(() => castValueForColumn("2026-07-13T99:99", col("timestamp"))).toThrow(TableSqlError);
    });

    it("attaches the column name to cast errors", () => {
        try {
            castValueForColumn("x", { ...col("integer"), name: "points" });
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(TableSqlError);
            expect((err as TableSqlError).kind).toBe("cast");
            expect((err as TableSqlError).column).toBe("points");
        }
    });
});
