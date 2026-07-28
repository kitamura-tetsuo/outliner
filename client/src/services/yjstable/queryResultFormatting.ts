// Postgres returns DATE/TIMESTAMP/TIMESTAMPTZ columns as JS Date objects.
// Every consumer of a query result (the table grid, a calendar's role
// editor/preview) needs plain, stable text instead, so Date-valued columns
// are rendered to fixed text per Postgres type before a result leaves the
// engine.

const DATE_OID = 1082;
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;

export interface QueryResultField {
    name: string;
    dataTypeID: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Render Date-valued columns of a query result to fixed text, per Postgres type. */
export function formatQueryDateFields(
    fields: QueryResultField[],
    rows: Record<string, unknown>[],
): Record<string, unknown>[] {
    const dateFields = new Set(fields.filter((f) => f.dataTypeID === DATE_OID).map((f) => f.name));
    const tsNoTzFields = new Set(fields.filter((f) => f.dataTypeID === TIMESTAMP_OID).map((f) => f.name));
    const tsTzFields = new Set(fields.filter((f) => f.dataTypeID === TIMESTAMPTZ_OID).map((f) => f.name));

    return rows.map((row) => {
        const newRow = { ...row };
        for (const [key, value] of Object.entries(newRow)) {
            if (!(value instanceof Date)) continue;
            if (dateFields.has(key)) {
                newRow[key] = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
            } else if (tsNoTzFields.has(key)) {
                newRow[key] = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${
                    pad(value.getHours())
                }:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${
                    String(value.getMilliseconds()).padStart(3, "0")
                }Z`;
            } else if (tsTzFields.has(key)) {
                newRow[key] = value.toISOString();
            }
        }
        return newRow;
    });
}
