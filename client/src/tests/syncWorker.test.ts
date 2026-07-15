import fs from "fs";
import { createRequire } from "module";
import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { SyncWorker } from "../services/syncWorker";
import type { SqlJsDatabase } from "../services/syncWorker";

let db: import("sql.js").Database & SqlJsDatabase;

const require = createRequire(import.meta.url);

beforeAll(async () => {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary });
    db = new SQL.Database() as unknown as import("sql.js").Database & SqlJsDatabase;
    db.exec("CREATE TABLE tbl(id TEXT PRIMARY KEY, val INTEGER)");
    db.exec("INSERT INTO tbl VALUES('a',1)");
});

describe("syncWorker", () => {
    it("applies op to sqlite", () => {
        const worker = new SyncWorker(db as unknown as SqlJsDatabase);
        worker.applyOp({ table: "tbl", pk: "a", column: "val", value: 2 });
        const res = db.exec("SELECT val FROM tbl WHERE id='a'")[0].values[0][0];
        expect(res).toBe(2);
    });
});
