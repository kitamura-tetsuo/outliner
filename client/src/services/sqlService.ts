import initSqlJs, { Database, type QueryExecResult } from 'sql.js';
import { writable } from 'svelte/store';

export interface ColumnMeta {
    name: string;
    table: string | null;
    column: string | null;
    db: string | null;
}

export interface QueryResult {
    rows: any[];
    columnsMeta: ColumnMeta[];
}

let db: Database | null = null;

export async function initDb(data?: Uint8Array) {
    const SQL = await initSqlJs({});
    db = new SQL.Database(data);
}

export function execute(sql: string): QueryResult {
    if (!db) throw new Error('Database not initialized');
    const res = db.exec(sql);
    if (res.length === 0) return { rows: [], columnsMeta: [] };
    const result = res[0] as QueryExecResult;
    const columnsMeta: ColumnMeta[] = result.columns.map(name => ({
        name,
        table: null,
        column: null,
        db: null,
    }));
    const rows = result.values.map(row => {
        const obj: Record<string, any> = {};
        result.columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
    return { rows, columnsMeta };
}

export const queryStore = writable<QueryResult>({ rows: [], columnsMeta: [] });

export function runQuery(sql: string) {
    queryStore.set(execute(sql));
}
