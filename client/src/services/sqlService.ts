import initSqlJs, { type Database } from "sql.js";
import { writable } from "svelte/store";
import type { EditInfo } from "./editMapper";
import { type Op, SyncWorker } from "./syncWorker";

interface ColumnMeta {
    name: string;
    table?: string;
    pkAlias?: string;
    column?: string;
}

interface QueryResult {
    rows: Record<string, unknown>[];
    columnsMeta: ColumnMeta[];
}

type SqlJsModule = typeof import("sql.js");
let SQL: SqlJsModule | null = null;
let db: Database | null = null;
let currentSelect = "";
let worker: SyncWorker | null = null;

export const queryStore = writable<QueryResult>({ rows: [], columnsMeta: [] });

// テスト環境でqueryStoreをwindowオブジェクトに公開
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

    console.log("Initializing SQL.js database...");

    // テスト環境または本番環境では適切なパスでWASMを読み込み
    if (
        typeof process !== "undefined"
        && (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" || process.env.VITEST === "true"
            || process.env.NODE_ENV === "production")
    ) {
        const fs = await import("fs");
        const path = await import("path");
        // Try multiple possible paths for the WASM file
        const possiblePaths = [
            path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../../node_modules/sql.js/dist/sql-wasm.wasm"),
            path.resolve(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm"),
            "./node_modules/sql.js/dist/sql-wasm.wasm",
        ];

        let wasmBinary;
        let wasmPath = "";
        for (const possiblePath of possiblePaths) {
            try {
                wasmBinary = fs.readFileSync(possiblePath);
                wasmPath = possiblePath;
                break;
            } catch {
                // Continue to next path
            }
        }

        if (!wasmBinary) {
            throw new Error("Could not find sql-wasm.wasm file in any expected location");
        }

        console.log(`Loading WASM from: ${wasmPath}`);

        SQL = await initSqlJs({
            wasmBinary: wasmBinary,
        });
    } else {
        // 開発環境ではViteのpublicディレクトリからWASMを読み込み
        SQL = await initSqlJs({
            locateFile: (file: string) => {
                if (file.endsWith(".wasm")) {
                    // 開発環境ではpublicディレクトリにあるWASMファイルを使用
                    return `/node_modules/sql.js/dist/sql-wasm.wasm`;
                }
                return file;
            },
        });
    }

    db = new SQL.Database();
    worker = new SyncWorker(db);
    console.log("SQL.js database initialized successfully");
}

function extendQuery(sql: string): { sql: string; aliases: string[]; tableMap: Record<string, string>; } {
    console.log("extendQuery called with:", sql);

    // 最後のSELECT文のみを処理
    const lastSelectIndex = sql.toUpperCase().lastIndexOf("SELECT");
    console.log("lastSelectIndex:", lastSelectIndex);
    if (lastSelectIndex === -1) {
        console.log("No SELECT found, returning original");
        return { sql, aliases: [], tableMap: {} };
    }

    const selectPart = sql.slice(lastSelectIndex);
    const beforeSelect = sql.slice(0, lastSelectIndex);
    console.log("selectPart:", selectPart);

    // FROMとJOINを分けて処理
    const fromRegex =
        /\bfrom\s+([a-zA-Z0-9_]+)(?:\s+(?:as\s+)?([a-zA-Z0-9_]+))?(?=\s+(?:join|where|group|order|limit|on|;|$)|\s*;|\s*$)/gi;
    const joinRegex =
        /\bjoin\s+([a-zA-Z0-9_]+)(?:\s+(?:as\s+)?([a-zA-Z0-9_]+))?(?=\s+(?:on|join|where|group|order|limit|;|$)|\s*;|\s*$)/gi;
    const tableMap: Record<string, string> = {};
    let match;
    console.log("Testing regex against:", selectPart);
    // FROM句の処理
    while ((match = fromRegex.exec(selectPart)) !== null) {
        console.log("FROM match:", match);
        const table = match[1];
        const alias = match[2] || table;
        console.log("FROM Table:", table, "Alias:", alias);
        tableMap[alias] = table;
    }

    // JOIN句の処理
    while ((match = joinRegex.exec(selectPart)) !== null) {
        console.log("JOIN match:", match);
        const table = match[1];
        const alias = match[2] || table;
        console.log("JOIN Table:", table, "Alias:", alias);
        tableMap[alias] = table;
    }
    if (Object.keys(tableMap).length === 0) {
        console.log("No aliases found, returning original");
        return { sql, aliases: [], tableMap };
    }

    const selectMatch = selectPart.match(/select\s+([\s\S]+?)\s+from/i);
    console.log("selectMatch:", selectMatch);
    if (!selectMatch) {
        console.log("No select match found, returning original");
        return { sql, aliases, tableMap };
    }

    const selectClause = selectMatch[1];
    console.log("selectClause:", selectClause);
    const aliasesInSelect = Object.keys(tableMap);
    const additions = aliasesInSelect
        .filter(a => !new RegExp(`${a}.id`, "i").test(selectClause))
        .map(a => `${a}.id AS ${a}_pk`);
    console.log("additions:", additions);
    if (additions.length === 0) {
        console.log("No additions needed, returning original");
        return { sql, aliases: aliasesInSelect, tableMap };
    }

    // Extract aliases from the tableMap keys
    const aliases = Object.keys(tableMap);

    const newSelect = `${selectClause}, ${additions.join(", ")}`;
    const modifiedSelectPart = selectPart.replace(selectMatch[0], `SELECT ${newSelect} FROM`);
    const modified = beforeSelect + modifiedSelectPart;

    console.log("Extended query result:", { original: sql, modified, aliases, tableMap });
    return { sql: modified, aliases, tableMap };
}

export function runQuery(sql: string) {
    console.log("Running query:", sql);
    if (!db) throw new Error("DB not initialized");
    const { sql: extended, tableMap } = extendQuery(sql);
    console.log("Extended query:", extended);
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
            const alias = aliasMatch[1];
            table = tableMap[alias] || alias; // エイリアスを実際のテーブル名に変換
            column = aliasMatch[2];
        }
        columnsMeta.push({ name: col, table, pkAlias: table ? pkAliases[aliasMatch?.[1] || ""] : undefined, column });
    });
    const rows = res.values.map(v => {
        const obj: Record<string, unknown> = {};
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

export function applyEdit(info: EditInfo, value: unknown) {
    console.log("Applying edit:", info, "value:", value);
    if (!worker) {
        console.log("No worker available");
        return;
    }
    const op: Op = { table: info.table, pk: info.pk, column: info.column, value };
    worker.applyOp(op);
    console.log("Applied operation:", op);
    if (currentSelect) {
        console.log("Re-running query:", currentSelect);
        rawExec(currentSelect);
        runQuery(currentSelect);
    } else {
        console.log("No currentSelect to re-run");
    }
}
