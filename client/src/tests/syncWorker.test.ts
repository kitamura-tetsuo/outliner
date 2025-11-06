import { createRequire } from "module";
import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { SyncWorker } from "../services/syncWorker";

let db: Database;

const require = createRequire(import.meta.url);

beforeAll(async () => {
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    (db as any).run("CREATE TABLE tbl(id TEXT PRIMARY KEY, val INTEGER)");
    (db as any).run("INSERT INTO tbl VALUES('a',1)");
});

describe("syncWorker", () => {
    it("applies op to sqlite", () => {
        const worker = new SyncWorker(db as any);
        worker.applyOp({ table: "tbl", pk: "a", column: "val", value: 2 });
        const res = (db as any).exec("SELECT val FROM tbl WHERE id='a'")[0].values[0][0];
        expect(res).toBe(2);
    });
});
