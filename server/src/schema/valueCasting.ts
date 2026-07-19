import { DateTime } from "luxon";
import { ColumnKind } from "./schemaIntrospection.js";

export function castValue(value: any, kind: ColumnKind, isNullable: boolean): any {
    if (value === null || value === undefined) {
        if (!isNullable) {
            throw new Error("Value cannot be null");
        }
        return null;
    }

    switch (kind) {
        case "boolean":
            if (typeof value === "boolean") return value;
            if (typeof value === "string") return value.toLowerCase() === "true";
            if (typeof value === "number") return value !== 0;
            return Boolean(value);
        case "integer":
            const intVal = parseInt(String(value), 10);
            if (isNaN(intVal)) throw new Error("Invalid integer");
            return intVal;
        case "number":
            const floatVal = parseFloat(String(value));
            if (isNaN(floatVal)) throw new Error("Invalid number");
            return floatVal;
        case "date":
            // Expected format YYYY-MM-DD
            if (value instanceof Date) return value.toISOString().split("T")[0];
            const dt = DateTime.fromISO(String(value));
            if (!dt.isValid) throw new Error("Invalid date");
            return dt.toISODate();
        case "timestamp":
            if (value instanceof Date) return value.toISOString();
            const ts = DateTime.fromISO(String(value));
            if (!ts.isValid) throw new Error("Invalid timestamp");
            return ts.toISO();
        case "text":
        case "other":
            return String(value);
    }
}
