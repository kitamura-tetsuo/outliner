import { get } from "svelte/store";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyEdit, initDb, queryStore, rawExec, runQuery } from "../services/sqlService";

describe("sqlService", () => {
    beforeAll(async () => {
        await initDb();
    });

    beforeEach(() => {
        rawExec(
            "DROP TABLE IF EXISTS tbl; DROP TABLE IF EXISTS tbl2; DROP TABLE IF EXISTS t1; DROP TABLE IF EXISTS t2;",
        );
    });

    it("runs simple query", () => {
        rawExec('CREATE TABLE tbl(id TEXT PRIMARY KEY, val INTEGER); INSERT INTO tbl VALUES("1",1);');
        runQuery(
            "SELECT val as tbl_val FROM tbl",
        );
        const data = get(queryStore);
        expect(data.rows[0].tbl_val).toBe(1);
    });

    it("extracts columns from join with pk alias", () => {
        rawExec(
            'CREATE TABLE t1(id TEXT PRIMARY KEY, a INTEGER); CREATE TABLE t2(id TEXT PRIMARY KEY, b INTEGER); INSERT INTO t1 VALUES("1",1); INSERT INTO t2 VALUES("1",2);',
        );
        runQuery(
            "SELECT t1.a AS t1_a, t2.b AS t2_b FROM t1 JOIN t2 ON t1.id=t2.id",
        );
        const data = get(queryStore);
        const t1PkAlias = data.columnsMeta[0].pkAlias;
        const t2PkAlias = data.columnsMeta[1].pkAlias;

        expect(t1PkAlias).toBeDefined();
        expect(t1PkAlias?.startsWith("pk_")).toBe(true);
        expect(t2PkAlias).toBeDefined();
        expect(t2PkAlias?.startsWith("pk_")).toBe(true);

        expect(data.columnsMeta[0]).toEqual({ name: "t1_a", table: "t1", pkAlias: t1PkAlias, column: "a" });
        expect(data.columnsMeta[1]).toEqual({ name: "t2_b", table: "t2", pkAlias: t2PkAlias, column: "b" });
        expect(data.rows[0][t1PkAlias!]).toBe("1");
    });

    it("rejects mutation queries by default", () => {
        expect(() => runQuery("CREATE TABLE temp(id TEXT)")).toThrow("Only SELECT queries are allowed");
    });

    it("applyEdit updates db and reruns query", () => {
        rawExec('CREATE TABLE tbl2(id TEXT PRIMARY KEY, val INTEGER); INSERT INTO tbl2 VALUES("1",1);');
        runQuery(
            "SELECT val AS tbl2_val FROM tbl2",
        );
        applyEdit({ table: "tbl2", pk: "1", column: "val" }, 5);
        const data = get(queryStore);
        expect(data.rows[0].tbl2_val).toBe(5);
    });
});
