// Strict casting of Yjs Data Storage values into PGlite query parameters.
//
// Records live in Y.Map fields as loosely-typed JSON primitives; before they
// are written to PGlite they are cast according to the applied schema. A value
// that cannot be represented in the column's type is a per-record sync error
// (surfaced in the UI), never a silent coercion.

import { TableSqlError } from "./pgliteService";
import type { ColumnKind, TableColumnSchema } from "./schemaIntrospection";

function castError(column: TableColumnSchema, value: unknown, expected: string): TableSqlError {
    return new TableSqlError(
        "cast",
        `Value ${JSON.stringify(value)} is not a valid ${expected} for column "${column.name}" (${column.dataType})`,
        { column: column.name },
    );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

function isValidTimeOfDay(timePart: string): boolean {
    const [hh, mm, ss = "0"] = timePart.split(":");
    return Number(hh) <= 23 && Number(mm) <= 59 && Number.parseFloat(ss) < 60;
}

function isRealCalendarDate(datePart: string): boolean {
    const [y, m, d] = datePart.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Cast a raw record value to a parameter value for the given column.
 * Returns null for null/undefined/empty-string (letting PGlite enforce NOT
 * NULL constraints) and throws a TableSqlError with kind "cast" when the
 * value cannot be represented in the column's type.
 */
export function castValueForColumn(value: unknown, column: TableColumnSchema): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value === "" && column.kind !== "text") return null;

    const kind: ColumnKind = column.kind;
    switch (kind) {
        case "text":
            if (typeof value === "string") return value;
            if (typeof value === "number" || typeof value === "boolean") return String(value);
            throw castError(column, value, "text");
        case "integer": {
            if (typeof value === "number") {
                if (!Number.isInteger(value)) throw castError(column, value, "integer");
                return value;
            }
            if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
                return Number.parseInt(value.trim(), 10);
            }
            if (typeof value === "boolean") throw castError(column, value, "integer");
            throw castError(column, value, "integer");
        }
        case "number": {
            if (typeof value === "number") {
                if (!Number.isFinite(value)) throw castError(column, value, "number");
                return value;
            }
            if (typeof value === "string") {
                const parsed = Number(value.trim());
                if (value.trim() !== "" && Number.isFinite(parsed)) return parsed;
            }
            throw castError(column, value, "number");
        }
        case "boolean": {
            if (typeof value === "boolean") return value;
            if (value === "true") return true;
            if (value === "false") return false;
            throw castError(column, value, "boolean");
        }
        case "date": {
            if (typeof value === "string" && DATE_RE.test(value) && isRealCalendarDate(value)) {
                return value;
            }
            throw castError(column, value, "date (YYYY-MM-DD)");
        }
        case "timestamp": {
            if (
                typeof value === "string" && TIMESTAMP_RE.test(value)
                && isRealCalendarDate(value.slice(0, 10))
                && isValidTimeOfDay(value.slice(11))
            ) {
                return value;
            }
            throw castError(column, value, "timestamp (YYYY-MM-DDTHH:MM[:SS])");
        }
        case "other": {
            if (typeof value === "string") return value;
            throw castError(column, value, column.dataType);
        }
    }
}
