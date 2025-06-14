import type { ColumnMeta } from './sqlService';

export interface EditInfo {
    tableId: string;
    pk: string;
    column: string;
    value: any;
}

export function mapEdit(columns: ColumnMeta[], row: any, columnIndex: number, value: any): EditInfo | null {
    const meta = columns[columnIndex];
    if (!meta.table || !meta.column) return null;
    const pkAlias = `${meta.table}_pk`;
    const pk = row[pkAlias];
    if (!pk) return null;
    return { tableId: meta.table, pk, column: meta.column, value };
}
