import initSqlJs, { type Database } from "sql.js";
import { writable } from "svelte/store";
import type { EditInfo } from "./editMapper";
import {
    type Op,
    SyncWorker,
} from "./syncWorker";

interface ColumnMeta {
    name: string;
    table?: string;
    pkAlias?: string;
    column?: string;
}

interface QueryResult {
    rows: any[];
    columnsMeta: ColumnMeta[];
}

let SQL: any;
let db: Database | null = null;
let currentQuery = "";
let currentSelect = "";
let worker: SyncWorker | null = null;

export const queryStore = writable<QueryResult>({ rows: [], columnsMeta: [] });

export async function initDb() {
    if (db) return;
    SQL = await initSqlJs({
        locateFile: (file: string) => {
            if (file.endsWith(".wasm")) {
                // テスト環境では絶対パスを使用
                if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
                    const path = require("path");
                    return path.resolve(__dirname, "../../../node_modules/sql.js/dist/sql-wasm.wasm");
                }
                return `/sql-wasm.wasm`;
            }
            return file;
        },
    });
    db = new SQL.Database();
    worker = new SyncWorker(db);
}

function extendQuery(sql: string): { sql: string; aliases: string[]; } {
    const aliasRegex =
        /\b(?:from|join)\s+([a-zA-Z0-9_]+)(?:\s+(?:as\s+)?([a-zA-Z0-9_]+))?(?=\s+(?:join|on|using|where|$))/gi;
    const aliases: string[] = [];
    let match;
    while ((match = aliasRegex.exec(sql)) !== null) {
        const table = match[1];
        const alias = match[2] && !/^(on|using|join|where)$/i.test(match[2]) ? match[2] : table;
        if (!aliases.includes(alias)) aliases.push(alias);
    }
    if (aliases.length === 0) return { sql, aliases };
    const selectMatch = sql.match(/select\s+([\s\S]+?)\s+from/i);
    if (!selectMatch) return { sql, aliases };
    const selectClause = selectMatch[1];
    const additions = aliases
        .filter(a => !new RegExp(`${a}\.id`, "i").test(selectClause))
        .map(a => `${a}.id AS ${a}_pk`);
    if (additions.length === 0) return { sql, aliases };
    const newSelect = `${selectClause}, ${additions.join(", ")}`;
    const modified = sql.replace(selectMatch[0], `SELECT ${newSelect} FROM`);
    return { sql: modified, aliases };
}

export function runQuery(sql: string) {
    if (!db) throw new Error("DB not initialized");
    const { sql: extended, aliases } = extendQuery(sql);
    currentQuery = extended;
    const idx = extended.toUpperCase().lastIndexOf("SELECT");
    currentSelect = idx >= 0 ? extended.slice(idx) : extended;
    const results = db.exec(extended);
    if (results.length === 0) {
        queryStore.set({ rows: [], columnsMeta: [] });
        return;
    }
    const res = results[0];
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
            table = aliasMatch[1];
            column = aliasMatch[2];
        }
        columnsMeta.push({ name: col, table, pkAlias: table ? pkAliases[table] : undefined, column });
    });
    const rows = res.values.map(v => {
        const obj: any = {};
        res.columns.forEach((c, i) => {
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

export function applyEdit(info: EditInfo, value: any) {
    if (!worker) return;
    const op: Op = { table: info.table, pk: info.pk, column: info.column, value };
    worker.applyOp(op);
    if (currentSelect) {
        rawExec(currentSelect);
        runQuery(currentSelect);
    }
}
