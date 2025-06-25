import { get } from "svelte/store";
import {
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import {
    applyEdit,
    initDb,
    queryStore,
    runQuery,
} from "../services/sqlService";

describe("sqlService", () => {
    let uniqueId: string;

    beforeAll(async () => {
        await initDb();
    });

    beforeEach(() => {
        // テストごとにユニークなIDを生成
        uniqueId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    });

    it("runs simple query", () => {
        runQuery(
            `CREATE TABLE tbl_${uniqueId}(id TEXT PRIMARY KEY, val INTEGER); INSERT INTO tbl_${uniqueId} VALUES("1",1); SELECT val as tbl_val FROM tbl_${uniqueId}`,
        );
        const data = get(queryStore);
        expect(data.rows[0].tbl_val).toBe(1);
    });

    it("extracts columns from join with pk alias", () => {
        runQuery(
            `CREATE TABLE t1_${uniqueId}(id TEXT PRIMARY KEY, a INTEGER); CREATE TABLE t2_${uniqueId}(id TEXT PRIMARY KEY, b INTEGER); INSERT INTO t1_${uniqueId} VALUES("1",1); INSERT INTO t2_${uniqueId} VALUES("1",2); SELECT t1.a AS t1_a, t2.b AS t2_b FROM t1_${uniqueId} t1 JOIN t2_${uniqueId} t2 ON t1.id=t2.id`,
        );
        const data = get(queryStore);
        expect(data.columnsMeta[0]).toEqual({ name: "t1_a", table: `t1_${uniqueId}`, pkAlias: "t1_pk", column: "a" });
        expect(data.columnsMeta[1]).toEqual({ name: "t2_b", table: `t2_${uniqueId}`, pkAlias: "t2_pk", column: "b" });
        expect(data.rows[0].t1_pk).toBe("1");
    });

    it("applyEdit updates db and reruns query", () => {
        runQuery(
            `CREATE TABLE tbl2_${uniqueId}(id TEXT PRIMARY KEY, val INTEGER); INSERT INTO tbl2_${uniqueId} VALUES("1",1); SELECT val AS tbl2_val FROM tbl2_${uniqueId}`,
        );
        applyEdit({ table: `tbl2_${uniqueId}`, pk: "1", column: "val" }, 5);
        const data = get(queryStore);
        expect(data.rows[0].tbl2_val).toBe(5);
    });
});
