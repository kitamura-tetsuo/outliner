import initSqlJs, { type Database } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { writable } from "svelte/store";
import { v4 as uuidv4 } from "uuid";
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
        rawExec?: typeof rawExec;
        initDb?: typeof initDb;
    }
}

if (typeof window !== "undefined") {
    window.queryStore = queryStore;
    window.rawExec = rawExec;
    window.initDb = initDb;
}

// Ensure the sql.js engine (SQL static) is initialized and return it.
// Extracted so that callers needing an isolated Database (e.g. schema parsing)
// can reuse the same WASM-loading logic without touching the shared `db`.
export async function getSqlStatic(): Promise<SqlJsStatic> {
    if (SQL) return SQL;

    // Load WASM from appropriate path in test or production environment
    if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
        const fs = await import("fs");
        const path = await import("path");
        const possiblePaths = [
            path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../../node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm"),
        ];

        let wasmBinary: Uint8Array | null = null;
        for (const possiblePath of possiblePaths) {
            try {
                wasmBinary = new Uint8Array(fs.readFileSync(possiblePath));
                break;
            } catch {}
        }
        if (!wasmBinary) throw new Error("Could not find sql-wasm.wasm in test env");
        SQL = await initSqlJs({ wasmBinary });
    } else {
        SQL = await initSqlJs({
            locateFile: (file: string) => file.endsWith(".wasm") ? sqlWasmUrl : file,
        });
    }

    if (!SQL) {
        throw new Error("Failed to initialize SQL.js");
    }
    return SQL;
}

export async function initDb() {
    if (db) return;

    // Load WASM from appropriate path in test or production environment
    if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
        const fs = await import("fs");
        const path = await import("path");
        const possiblePaths = [
            path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../../node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm"),
        ];

        let wasmBinary: Uint8Array | null = null;
        for (const possiblePath of possiblePaths) {
            try {
                wasmBinary = new Uint8Array(fs.readFileSync(possiblePath));
                break;
            } catch {}
        }
        if (!wasmBinary) throw new Error("Could not find sql-wasm.wasm in test env");
        SQL = await initSqlJs({ wasmBinary });
    } else {
        SQL = await initSqlJs({
            locateFile: (file: string) => file.endsWith(".wasm") ? sqlWasmUrl : file,
        });
    }

    if (!SQL) {
        throw new Error("Failed to initialize SQL.js");
    }

    db = new SQL.Database();
    worker = new SyncWorker(db as unknown as SqlJsDatabase);
}

function extendQuery(
    sql: string,
): { sql: string; aliases: string[]; tableMap: Record<string, string>; pkAliasMap: Record<string, string>; } {
    // Process only the last SELECT statement
    const lastSelectIndex = sql.toUpperCase().lastIndexOf("SELECT");
    if (lastSelectIndex === -1) {
        return { sql, aliases: [], tableMap: {}, pkAliasMap: {} };
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
        return { sql, aliases: [], tableMap: {}, pkAliasMap: {} };
    }

    const selectMatch = selectPart.match(/select\s+([\s\S]+?)\s+from/i);
    if (!selectMatch) {
        const aliases = Object.keys(tableMap);
        return { sql, aliases, tableMap, pkAliasMap: {} };
    }

    const selectClause = selectMatch[1];
    const aliasesInSelect = Object.keys(tableMap);
    const pkAliasMap: Record<string, string> = {};
    const additions = aliasesInSelect
        .filter(a => !new RegExp(`${a}.id`, "i").test(selectClause))
        .map(a => {
            const pkAlias = `pk_${uuidv4().replace(/-/g, "")}`;
            pkAliasMap[a] = pkAlias;
            return `"${a}".id AS ${pkAlias}`;
        });
    if (additions.length === 0) {
        return { sql, aliases: aliasesInSelect, tableMap, pkAliasMap };
    }

    // Extract aliases from the tableMap keys
    const aliases = Object.keys(tableMap);

    const newSelect = `${selectClause}, ${additions.join(", ")}`;
    const modifiedSelectPart = selectPart.replace(selectMatch[0], `SELECT ${newSelect} FROM`);
    const modified = beforeSelect + modifiedSelectPart;

    return { sql: modified, aliases, tableMap, pkAliasMap };
}

export function runQuery(sql: string, allowMutation = false) {
    if (!db) throw new Error("DB not initialized");

    const strippedSql = sql
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/'(?:[^'\\]|\\.)*'/g, "")
        .replace(/"(?:[^"\\]|\\.)*"/g, "");

    if (!allowMutation) {
        if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i.test(strippedSql) || /\bREPLACE\s+INTO\b/i.test(strippedSql)) {
            throw new Error("Only SELECT queries are allowed");
        }
    }

    const { sql: extended, tableMap, pkAliasMap } = extendQuery(sql);
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
    for (const [alias, uuid] of Object.entries(pkAliasMap)) {
        pkAliases[alias] = uuid;
    }

    const columnsMeta: ColumnMeta[] = [];
    res.columns.forEach((col: string) => {
        const isPkAlias = Object.values(pkAliasMap).includes(col);
        if (isPkAlias) return;

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

export function syncYDatabase(ydb: import("yjs").Map<unknown>) {
    if (worker) {
        worker.connect(ydb);

        // Remove previous listeners to prevent accumulation
        worker.off?.("remote_change");

        worker.on("remote_change", () => {
            if (currentSelect) {
                try {
                    runQuery(currentSelect);
                } catch {
                    // Ignore transient query errors during sync
                }
            }
        });
    }
}
