import { describe, expect, it } from "vitest";
import { IMPLICIT_SELECT_ALIAS_ERROR, validateExplicitSelectAliases } from "../../src/services/explicitSelectAlias";

describe("validateExplicitSelectAliases", () => {
    it.each([
        "SELECT a AS b FROM t",
        'SELECT "order" AS "title" FROM inserted',
        "SELECT value /* expression */ AS /* alias */ v FROM table1",
        "SELECT 'value AS fake_alias' AS actual_alias",
        "SELECT * FROM (SELECT a AS b FROM t) AS q",
        "SELECT a, count(*), lower(name) FROM t GROUP BY a, name",
        "WITH q(a, b) AS (SELECT a, b FROM t) SELECT * FROM q",
        "SELECT count(*) FILTER (WHERE ok) AS total FROM t",
        "SELECT row_number() OVER (PARTITION BY a ORDER BY b) AS n FROM t",
    ])("accepts %s", sql => expect(() => validateExplicitSelectAliases(sql)).not.toThrow());

    it.each([
        "SELECT a b FROM t",
        'SELECT "order" "title" FROM inserted',
        "SELECT value /* comment */ v FROM table1",
        "SELECT * FROM (SELECT a b FROM t) AS q",
        'SELECT id, template_id, "order" title, cadence FROM inserted',
        "INSERT INTO destination SELECT value v FROM inserted RETURNING *",
    ])("rejects %s", sql => expect(() => validateExplicitSelectAliases(sql)).toThrow(IMPLICIT_SELECT_ALIAS_ERROR));
});
