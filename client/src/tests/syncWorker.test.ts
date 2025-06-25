import { createRequire } from "module";
import initSqlJs from "sql.js";
import {
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import { SyncWorker } from "../services/syncWorker";

let db: any;
let uniqueId: string;

const require = createRequire(import.meta.url);

beforeAll(async () => {
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
});

beforeEach(() => {
    // テストごとにユニークなIDを生成
    uniqueId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    db.run(`CREATE TABLE tbl_${uniqueId}(id TEXT PRIMARY KEY, val INTEGER)`);
    db.run(`INSERT INTO tbl_${uniqueId} VALUES('a',1)`);
});

describe("syncWorker", () => {
    it("applies op to sqlite", () => {
        const worker = new SyncWorker(db);
        worker.applyOp({ table: `tbl_${uniqueId}`, pk: "a", column: "val", value: 2 });
        const res = db.exec(`SELECT val FROM tbl_${uniqueId} WHERE id='a'`)[0].values[0][0];
        expect(res).toBe(2);
    });
});
