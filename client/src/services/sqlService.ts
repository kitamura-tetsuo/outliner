import initSqlJs, { type Database } from "sql.js";
import { writable } from "svelte/store";
import type { EditInfo } from "./editMapper";
import { type Op, type SqlJsDatabase, SyncWorker } from "./syncWorker";

export interface ColumnMeta {
    name: string;
    table?: string;
    pkAlias?: string;
    column?: string;
}

export interface QueryResult {
    rows: Record<string, unknown>[];
    columnsMeta: ColumnMeta[];
}

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let currentSelect = "";
let worker: SyncWorker | null = null;

export const queryStore = writable<QueryResult>({ rows: [], columnsMeta: [] });

// Expose queryStore to window object in test environment
declare global {
    interface Window {
        queryStore?: typeof queryStore;
    }
}

if (typeof window !== "undefined") {
    window.queryStore = queryStore;
}

export async function initDb() {
    if (db) return;

    const isTest = typeof process !== "undefined"
        && (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "production");
    const isViteTest = import.meta.env && import.meta.env.MODE === "test";

    // Load WASM from appropriate path in test or production environment
    if (isTest || isViteTest) {
        const fs = await import("fs");
        const path = await import("path");
        // Try multiple possible paths for the WASM file
        const possiblePaths = [
            path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(process.cwd(), "client/node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../../node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm"),
        ];

        let wasmBinary: Uint8Array | null = null;
        for (const possiblePath of possiblePaths) {
            try {
                const buffer = fs.readFileSync(possiblePath);
                wasmBinary = new Uint8Array(buffer);
                break;
            } catch {
                // Continue to next path
            }
        }

        if (!wasmBinary) {
            throw new Error(
                `Could not find sql-wasm.wasm file in any expected location. Tried: ${possiblePaths.join(", ")}`,
            );
        }

        SQL = await initSqlJs({
            wasmBinary: wasmBinary,
        });
    } else {
        // Load WASM from Vite's public directory in development environment
        SQL = await initSqlJs({
            locateFile: (file: string) => {
                if (file.endsWith(".wasm")) {
                    // Use WASM file in public directory in development environment
                    return `/node_modules/sql.js/dist/sql-wasm.wasm`;
                }
                return file;
            },
        });
    }

    if (!SQL) {
        throw new Error("Failed to initialize SQL.js");
    }

    db = new SQL.Database();
    worker = new SyncWorker(db as unknown as SqlJsDatabase);
}

function extendQuery(sql: string): { sql: string; aliases: string[]; tableMap: Record<string, string>; } {
    // Process only the last SELECT statement
    const lastSelectIndex = sql.toUpperCase().lastIndexOf("SELECT");
    if (lastSelectIndex === -1) {
        return { sql, aliases: [], tableMap: {} };
    }

    const selectPart = sql.slice(lastSelectIndex);
    const beforeSelect = sql.slice(0, lastSelectIndex);

    // Process FROM and JOIN separately
    const fromRegex =
        /\bfrom\s+([a-zA-Z0-9_]+)(?:\s+(?:as\s+)?([a-zA-Z0-9_]+))?(?=\s+(?:join|where|group|order|limit|on|;|$)|\s*;|\s*$)/gi;
    const joinRegex =
        /\bjoin\s+([a-zA-Z0-9_]+)(?:\s+(?:as\s+)?([a-zA-Z0-9_]+))?(?=\s+(?:on|join|where|group|order|limit|;|$)|\s*;|\s*$)/gi;
    const tableMap: Record<string, string> = {};
    let match;
    // Process FROM clause
    while ((match = fromRegex.exec(selectPart)) !== null) {
        const table = match[1];
        const alias = match[2] || table;
        tableMap[alias] = table;
    }

    // Process JOIN clause
    while ((match = joinRegex.exec(selectPart)) !== null) {
        const table = match[1];
        const alias = match[2] || table;
        tableMap[alias] = table;
    }
    if (Object.keys(tableMap).length === 0) {
        return { sql, aliases: [], tableMap };
    }

    const selectMatch = selectPart.match(/select\s+([\s\S]+?)\s+from/i);
    if (!selectMatch) {
        const aliases = Object.keys(tableMap);
        return { sql, aliases, tableMap };
    }

    const selectClause = selectMatch[1];
    const aliasesInSelect = Object.keys(tableMap);
    const additions = aliasesInSelect
        .filter(a => !new RegExp(`${a}.id`, "i").test(selectClause))
        .map(a => `${a}.id AS ${a}_pk`);
    if (additions.length === 0) {
        return { sql, aliases: aliasesInSelect, tableMap };
    }

    // Extract aliases from the tableMap keys
    const aliases = Object.keys(tableMap);

    const newSelect = `${selectClause}, ${additions.join(", ")}`;
    const modifiedSelectPart = selectPart.replace(selectMatch[0], `SELECT ${newSelect} FROM`);
    const modified = beforeSelect + modifiedSelectPart;

    return { sql: modified, aliases, tableMap };
}

export function runQuery(sql: string) {
    if (!db) throw new Error("DB not initialized");
    const { sql: extended, tableMap } = extendQuery(sql);
    const idx = extended.toUpperCase().lastIndexOf("SELECT");
    currentSelect = idx >= 0 ? extended.slice(idx) : extended;
    const results = db.exec(extended);

    // Find the last result that has columns (likely the SELECT statement)
    // In sql.js 1.14.0, 'columns' might be minified to 'lc'
    let res;
    for (let i = results.length - 1; i >= 0; i--) {
        const r = results[i] as unknown as { columns: string[]; lc?: string[]; values: unknown[][]; };
        if (r.columns) {
            res = r;
            break;
        }
        if (r.lc) {
            r.columns = r.lc;
            res = r;
            break;
        }
    }

    if (!res) {
        queryStore.set({ rows: [], columnsMeta: [] });
        return;
    }

    const pkAliases: Record<string, string> = {};
    res.columns.forEach(col => {
        const m = col.match(/^(\w+)_pk$/);
        if (m) pkAliases[m[1]] = col;
    });
    const columnsMeta: ColumnMeta[] = [];
    res.columns.forEach(col => {
        if (/^(\w+)_pk$/.test(col)) return;
        const aliasMatch = col.match(/^(\w+)_(.+)$/);
        let table: string | undefined;
        let column = col;
        if (aliasMatch) {
            const alias = aliasMatch[1];
            table = tableMap[alias] || alias; // Convert alias to actual table name
            column = aliasMatch[2];
        }
        columnsMeta.push({ name: col, table, pkAlias: table ? pkAliases[aliasMatch?.[1] || ""] : undefined, column });
    });
    const rows = res.values.map(v => {
        const obj: Record<string, unknown> = {};
        res.columns.forEach((c: string, i: number) => {
            obj[c] = v[i];
        });
        return obj;
    });
    queryStore.set({ rows, columnsMeta });
}

export function getDb() {
    return db;
}

export function rawExec(sql: string) {
    if (!db) throw new Error("DB not initialized");
    db.exec(sql);
}

export function applyEdit(info: EditInfo, value: unknown) {
    if (!worker) {
        return;
    }
    const op: Op = { table: info.table, pk: info.pk, column: info.column, value };
    worker.applyOp(op);
    if (currentSelect) {
        rawExec(currentSelect);
        runQuery(currentSelect);
    }
}
