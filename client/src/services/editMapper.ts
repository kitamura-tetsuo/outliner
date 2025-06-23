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
    const meta = columns.find(c => c.name === column);
    if (!meta || !meta.table || !meta.pkAlias) return null;
    const pk = row[meta.pkAlias];
    if (pk === undefined) return null;
    return { table: meta.table, pk, column: meta.column || column };
}
