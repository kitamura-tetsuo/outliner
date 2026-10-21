import { describe, expect, it } from "vitest";
import {
    analyzeReadOnlySelect,
    parseSqlIdentifiers,
    parseTopLevelInsertTarget,
    validateReadOnlySelect,
} from "../../src/services/readOnlySql";

describe("readOnlySql PostgreSQL AST admission", () => {
    it("preserves valid SQL and its PostgreSQL lexical boundaries", () => {
        const sql = "  SELECT $$UPDATE; DROP$$ AS value /* nested /* SELECT */ comment */  ";
        expect(validateReadOnlySelect(sql)).toBe(sql.trim());
        expect(() => validateReadOnlySelect("SELECT 'unterminated")).toThrow();
        expect(() => validateReadOnlySelect("SELECT 1; SELECT 2")).toThrow(/exactly one/i);
    });

    it("rejects writing CTEs, SELECT INTO, and row locks", () => {
        expect(() =>
            validateReadOnlySelect(
                "WITH changed AS (DELETE FROM tasks RETURNING *) SELECT * FROM changed",
            )
        ).toThrow(/read-only/i);
        expect(() => validateReadOnlySelect("SELECT * INTO copied FROM tasks")).toThrow(/SELECT INTO/i);
        expect(() => validateReadOnlySelect("SELECT * FROM tasks FOR UPDATE")).toThrow(/Row-locking/i);
        expect(validateReadOnlySelect("WITH source AS (SELECT * FROM tasks) SELECT * FROM source"))
            .toContain("SELECT * FROM source");
    });

    it("reports clauses only from the outer result", () => {
        expect(analyzeReadOnlySelect(
            "WITH x AS (SELECT * FROM tasks WHERE done ORDER BY id) SELECT * FROM x",
        )).toMatchObject({ hasOuterWhere: false, hasOuterOrderBy: false });
        expect(analyzeReadOnlySelect(
            "SELECT (SELECT id FROM tasks ORDER BY id LIMIT 1) AS id WHERE true ORDER BY id",
        )).toMatchObject({ hasOuterWhere: true, hasOuterOrderBy: true });
        expect(analyzeReadOnlySelect("SELECT 'where order by' AS value"))
            .toMatchObject({ hasOuterWhere: false, hasOuterOrderBy: false });
    });

    it("reads only an unqualified outer INSERT target with parsed identifier case", () => {
        expect(parseTopLevelInsertTarget("WITH x AS (SELECT 1) INSERT INTO tasks VALUES (1) RETURNING *"))
            .toBe("tasks");
        expect(parseTopLevelInsertTarget('INSERT INTO "Tasks" VALUES (1) RETURNING *')).toBe("Tasks");
        expect(parseTopLevelInsertTarget("INSERT INTO public.tasks VALUES (1) RETURNING *")).toBeUndefined();
        expect(parseTopLevelInsertTarget("WITH x AS (INSERT INTO hidden VALUES (1) RETURNING *) SELECT * FROM x"))
            .toBeUndefined();
    });

    it("uses scanner tokens for conservative identifier candidates", () => {
        expect(parseSqlIdentifiers(`SELECT "Mixed", 'not_an_identifier' FROM tasks -- hidden\n`))
            .toEqual(new Set(["select", "Mixed", "from", "tasks"]));
        expect(() => parseSqlIdentifiers("SELECT 'unterminated")).toThrow();
    });
});
