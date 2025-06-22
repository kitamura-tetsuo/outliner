import initSqlJs, {
    Database,
    type QueryExecResult,
} from "sql.js";
import { writable } from "svelte/store";

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
    try {
        let SQL;

        // In test environment, load WASM file directly
        if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
            const fs = await import("fs");
            const path = await import("path");
            const wasmPath = path.join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm");
            const wasmBinary = fs.readFileSync(wasmPath);

            SQL = await initSqlJs({
                wasmBinary,
            });
        }
        else {
            // In browser environment, use CDN
            SQL = await initSqlJs({
                locateFile: (file: string) => {
                    return `https://sql.js.org/dist/${file}`;
                },
            });
        }

        db = new SQL.Database(data);
        console.log("SQLite database initialized successfully");
    }
    catch (error) {
        console.error("Failed to initialize SQLite database:", error);
        throw error;
    }
}

export function execute(sql: string): QueryResult {
    if (!db) throw new Error("Database not initialized");
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
    try {
        console.log("Executing SQL query:", sql);
        const result = execute(sql);
        console.log("Query result:", result);
        queryStore.set(result);
    }
    catch (error) {
        console.error("Failed to execute SQL query:", error);
        queryStore.set({ rows: [], columnsMeta: [] });
    }
}
