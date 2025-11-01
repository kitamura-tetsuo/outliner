interface ColumnMeta {
    name: string;
    table?: string;
    pkAlias?: string;
    column?: string;
}

export interface EditInfo {
    table: string;
    pk: string;
    column: string;
}

export function mapEdit(columns: ColumnMeta[], row: any, column: string): EditInfo | null {
    console.log("mapEdit called with:", { columns, row, column });
    const meta = columns.find(c => c.name === column);
    console.log("Found meta:", meta);
    if (!meta || !meta.table || !meta.pkAlias) {
        console.log("mapEdit failed: missing meta, table, or pkAlias");
        return null;
    }
    const pk = row[meta.pkAlias];
    console.log("Primary key value:", pk);
    if (pk === undefined) {
        console.log("mapEdit failed: pk is undefined");
        return null;
    }
    const result = { table: meta.table, pk, column: meta.column || column };
    console.log("mapEdit result:", result);
    return result;
}
