import { createRequire } from "module";
import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { type SqlJsDatabase, SyncWorker } from "../services/syncWorker";

// Extend Database interface to include untyped methods
type ExtendedDatabase = Database & {
    run(sql: string): void;
    exec(sql: string): Array<{ values: Array<Array<unknown>>; }>;
};

let db: ExtendedDatabase;

const require = createRequire(import.meta.url);

beforeAll(async () => {
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database() as unknown as ExtendedDatabase;
    db.run("CREATE TABLE tbl(id TEXT PRIMARY KEY, val INTEGER)");
    db.run("INSERT INTO tbl VALUES('a',1)");
});

describe("syncWorker", () => {
    it("applies op to sqlite", () => {
        const worker = new SyncWorker(db as unknown as SqlJsDatabase);
        worker.applyOp({ table: "tbl", pk: "a", column: "val", value: 2 });
        const res = db.exec("SELECT val FROM tbl WHERE id='a'")[0].values[0][0] as number;
        expect(res).toBe(2);
    });
});
