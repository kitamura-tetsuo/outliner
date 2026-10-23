import { describe, expect, it } from "vitest";
import { rewriteCreateTableSql, rewriteTableQuerySql, TableSqlRewriteError } from "./tableSqlRewrite";

describe("rewriteCreateTableSql", () => {
    it("rewrites only the CREATE TABLE relation and preserves formatting, comments, columns, and literals", () => {
        const sql =
            `-- keep sales in this comment\nCREATE  TABLE  sales (\n  sales TEXT DEFAULT 'sales',\n  note TEXT\n);`;
        expect(rewriteCreateTableSql(sql, "sales", "sales_2")).toEqual({
            sql: `-- keep sales in this comment\nCREATE  TABLE  sales_2 (\n  sales TEXT DEFAULT 'sales',\n  note TEXT\n);`,
            relationDependencies: [],
            actualRelationDependencies: [],
            actualReservedRelationDependencies: [],
            reservedRelationDependencies: [],
        });
    });

    it("supports quoted relation identifiers without changing quote style", () => {
        expect(rewriteCreateTableSql('CREATE TABLE "sales" (id TEXT)', "sales", "sales_2").sql)
            .toBe('CREATE TABLE "sales_2" (id TEXT)');
    });

    it("rewrites self-referential foreign keys with the created relation", () => {
        expect(
            rewriteCreateTableSql(
                "CREATE TABLE sales (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES sales(id))",
                "sales",
                "sales_2",
            ).sql,
        ).toBe("CREATE TABLE sales_2 (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES sales_2(id))");
    });

    it("rejects a mismatched or schema-qualified CREATE TABLE relation", () => {
        expect(() => rewriteCreateTableSql("CREATE TABLE other (id TEXT)", "sales", "sales_2"))
            .toThrow(/expected source relation/);
        expect(() => rewriteCreateTableSql("CREATE TABLE public.sales (id TEXT)", "sales", "sales_2"))
            .toThrow(/Schema-qualified/);
    });
});

describe("rewriteTableQuerySql", () => {
    it("uses byte locations while preserving Unicode, comments, and dollar-quoted text", () => {
        const sql = "-- 日本語 FROM tasks\nSELECT tasks.id, $$FROM tasks$$ AS note, 'tasks' AS source_kind FROM tasks";
        expect(rewriteTableQuerySql(sql, { tasks: "tasks_2" }).sql).toBe(
            "-- 日本語 FROM tasks\nSELECT tasks_2.id, $$FROM tasks$$ AS note, 'tasks_2' AS source_kind FROM tasks_2",
        );
    });

    it("applies PostgreSQL non-recursive and recursive CTE visibility", () => {
        expect(
            rewriteTableQuerySql("WITH tasks AS (SELECT * FROM tasks) SELECT * FROM tasks", { tasks: "tasks_2" }).sql,
        )
            .toBe("WITH tasks AS (SELECT * FROM tasks_2) SELECT * FROM tasks");
        expect(
            rewriteTableQuerySql(
                "WITH RECURSIVE tasks AS (SELECT 1 UNION ALL SELECT id FROM tasks) SELECT * FROM tasks",
                { tasks: "tasks_2" },
            ).actualRelationDependencies,
        ).toEqual([]);
    });

    it("does not classify computed source_kind expressions as routing references", () => {
        const result = rewriteTableQuerySql(
            "SELECT upper('tasks') AS source_kind, 'tasks' AS label FROM actual",
            { tasks: "tasks_2", actual: "actual_2" },
        );
        expect(result.sql).toBe("SELECT upper('tasks') AS source_kind, 'tasks' AS label FROM actual_2");
        expect(result.relationDependencies).toEqual(["actual"]);
    });

    it("reports reserved relations that rebind without treating them as clipboard dependencies", () => {
        const result = rewriteTableQuerySql("SELECT id, text FROM outline_items", new Map());

        expect(result.relationDependencies).toEqual([]);
        expect(result.actualRelationDependencies).toEqual([]);
        expect(result.actualReservedRelationDependencies).toEqual(["outline_items"]);
        expect(result.reservedRelationDependencies).toEqual(["outline_items"]);
    });

    it("separates source_kind labels from actual SQL relations", () => {
        const result = rewriteTableQuerySql(
            "SELECT 'unrelated' AS source_kind, status FROM tasks JOIN owners ON true",
            new Map(),
        );
        expect(result.relationDependencies).toEqual(["unrelated", "tasks", "owners"]);
        expect(result.actualRelationDependencies).toEqual(["tasks", "owners"]);
    });

    it("rewrites FROM and JOIN relations while preserving columns, aliases, comments, spacing, and unrelated literals", () => {
        const sql = "SELECT sales.id, 'sales' AS label /* sales */\n"
            + "FROM  sales sales JOIN customers c ON c.id = sales.customer_id\n"
            + "WHERE sales.note = 'customers'";
        const result = rewriteTableQuerySql(sql, { sales: "sales_2", customers: "customers_3" });

        expect(result.sql).toBe(
            "SELECT sales.id, 'sales' AS label /* sales */\n"
                + "FROM  sales_2 sales JOIN customers_3 c ON c.id = sales.customer_id\n"
                + "WHERE sales.note = 'customers'",
        );
        expect(result.relationDependencies).toEqual(["sales", "customers"]);
    });

    it("rewrites unaliased relation qualifiers throughout their query scope", () => {
        const sql = "SELECT sales.id FROM sales WHERE sales.active ORDER BY sales.id";
        expect(rewriteTableQuerySql(sql, { sales: "sales_2" }).sql).toBe(
            "SELECT sales_2.id FROM sales_2 WHERE sales_2.active ORDER BY sales_2.id",
        );
    });

    it("preserves explicit and implicit alias qualifiers", () => {
        expect(rewriteTableQuerySql("SELECT s.id FROM sales AS s WHERE s.active", { sales: "sales_2" }).sql)
            .toBe("SELECT s.id FROM sales_2 AS s WHERE s.active");
        expect(rewriteTableQuerySql("SELECT sales.id FROM sales sales", { sales: "sales_2" }).sql)
            .toBe("SELECT sales.id FROM sales_2 sales");
    });

    it("rewrites nested queries and comma-separated FROM relations with CTE awareness", () => {
        const sql = `WITH recent AS (
  SELECT o.id, o.customer_id FROM orders o
), totals AS (
  SELECT customer_id FROM recent
)
SELECT c.name
FROM customers c, (SELECT customer_id FROM totals) t
WHERE EXISTS (SELECT 1 FROM orders nested WHERE nested.customer_id = c.id)`;
        const result = rewriteTableQuerySql(sql, {
            orders: "orders_2",
            customers: "customers_2",
            recent: "must_not_replace",
            totals: "must_not_replace",
        });

        expect(result.sql).toContain("FROM orders_2 o");
        expect(result.sql).toContain("FROM recent");
        expect(result.sql).toContain("FROM customers_2 c, (SELECT customer_id FROM totals) t");
        expect(result.sql).toContain("FROM orders_2 nested");
        expect(result.sql).not.toContain("must_not_replace");
        expect(result.relationDependencies).toEqual(["orders", "customers"]);
    });

    it("rewrites copied relation literals only when directly projected as source_kind", () => {
        const sql = "SELECT 'orders'::text AS source_kind, id AS source_id, 'orders' AS label FROM orders "
            + "UNION ALL SELECT $$outline_items$$ source_kind, id source_id, text AS label FROM outline_items";
        const result = rewriteTableQuerySql(sql, { orders: "orders_2", outline_items: "never" });

        expect(result.sql).toBe(
            "SELECT 'orders_2'::text AS source_kind, id AS source_id, 'orders' AS label FROM orders_2 "
                + "UNION ALL SELECT $$outline_items$$ source_kind, id source_id, text AS label FROM outline_items",
        );
        expect(result.relationDependencies).toEqual(["orders"]);
    });

    it("does not mistake PostgreSQL expression FROM keywords for relation clauses", () => {
        const sql = "SELECT EXTRACT(YEAR FROM created_at) FROM sales "
            + "WHERE previous IS DISTINCT FROM current";
        const result = rewriteTableQuerySql(sql, {
            sales: "sales_2",
            created_at: "wrong",
            current: "wrong",
        });

        expect(result.sql).toBe(
            "SELECT EXTRACT(YEAR FROM created_at) FROM sales_2 "
                + "WHERE previous IS DISTINCT FROM current",
        );
        expect(result.relationDependencies).toEqual(["sales"]);
    });

    it("exposes unresolved relation dependencies for clone planning", () => {
        const result = rewriteTableQuerySql(
            "SELECT * FROM copied JOIN missing ON true JOIN outline_items ON true",
            { copied: "copied_2" },
        );
        expect(result.relationDependencies).toEqual(["copied", "missing"]);
    });

    it("rejects schema-qualified, function, and multiple-statement constructs", () => {
        expect(() => rewriteTableQuerySql("SELECT * FROM public.sales", { sales: "sales_2" }))
            .toThrow(TableSqlRewriteError);
        expect(() => rewriteTableQuerySql("SELECT * FROM sales()", { sales: "sales_2" }))
            .toThrow(/ambiguous/);
        expect(() => rewriteTableQuerySql("SELECT * FROM sales; SELECT 1", { sales: "sales_2" }))
            .toThrow(/one SQL statement/);
        expect(
            rewriteTableQuerySql("SELECT * FROM (sales JOIN customers ON true)", {
                sales: "sales_2",
                customers: "customers_2",
            }).sql,
        ).toBe("SELECT * FROM (sales_2 JOIN customers_2 ON true)");
    });
});

describe("rewriteTableQuerySql on data-modifying statements", () => {
    // Schedule rules are the only SQL that writes; a copied rule has to point
    // at the destination's relations, target included.
    const routineRuleSql = `WITH inserted AS (
    INSERT INTO routine_occurrences (id, template_id, title, cadence, occurrence_date, done)
    SELECT
        t.id || '-' || to_char(current_setting('job.occurrence')::timestamptz, 'YYYY-MM-DD'),
        t.id,
        t.title,
        t.cadence,
        (current_setting('job.occurrence')::timestamptz)::date,
        false
    FROM routine_templates t
    WHERE t.cadence = 'daily'
    ON CONFLICT (id) DO NOTHING
    RETURNING *
)
SELECT id, template_id, title, cadence, done FROM inserted`;

    it("rewrites the INSERT target and the relations a data-modifying CTE reads", () => {
        const result = rewriteTableQuerySql(routineRuleSql, {
            routine_occurrences: "routine_occurrences_2",
            routine_templates: "routine_templates_2",
        });

        expect(result.sql).toContain("INSERT INTO routine_occurrences_2 (id, template_id");
        expect(result.sql).toContain("FROM routine_templates_2 t");
        // The CTE name is not a relation of the project and must survive.
        expect(result.sql).toContain("FROM inserted");
        expect(result.relationDependencies.sort()).toEqual(["routine_occurrences", "routine_templates"]);
    });

    it("rewrites an UPDATE and a DELETE target", () => {
        expect(rewriteTableQuerySql("UPDATE tasks SET done = true WHERE id = '1'", { tasks: "tasks_2" }).sql)
            .toBe("UPDATE tasks_2 SET done = true WHERE id = '1'");
        expect(rewriteTableQuerySql("DELETE FROM tasks WHERE id = '1'", { tasks: "tasks_2" }).sql)
            .toBe("DELETE FROM tasks_2 WHERE id = '1'");
    });

    it.each([
        [
            "WITH tasks AS (SELECT 1) UPDATE tasks SET done = true",
            "WITH tasks AS (SELECT 1) UPDATE tasks_2 SET done = true",
        ],
        [
            "WITH tasks AS (SELECT 'new' AS id) INSERT INTO tasks (id) SELECT id FROM tasks",
            "WITH tasks AS (SELECT 'new' AS id) INSERT INTO tasks_2 (id) SELECT id FROM tasks",
        ],
        ["WITH tasks AS (SELECT 1) DELETE FROM tasks", "WITH tasks AS (SELECT 1) DELETE FROM tasks_2"],
    ])("treats a DML target as physical when it shares a CTE name", (sql, expected) => {
        const result = rewriteTableQuerySql(sql, { tasks: "tasks_2" });
        expect(result.sql).toBe(expected);
        expect(result.actualRelationDependencies).toEqual(["tasks"]);
    });

    it("leaves UPDATE alone where it is a locking clause or a conflict action", () => {
        expect(rewriteTableQuerySql("SELECT * FROM tasks FOR UPDATE", { tasks: "tasks_2" }).sql)
            .toBe("SELECT * FROM tasks_2 FOR UPDATE");
        expect(
            rewriteTableQuerySql(
                "INSERT INTO tasks (id) VALUES ('1') ON CONFLICT (id) DO UPDATE SET id = '1'",
                { tasks: "tasks_2" },
            ).sql,
        ).toBe("INSERT INTO tasks_2 (id) VALUES ('1') ON CONFLICT (id) DO UPDATE SET id = '1'");
    });
});

describe("rewriteTableQuerySql on qualified DML targets", () => {
    it("rewrites a column qualified by a renamed INSERT target", () => {
        const result = rewriteTableQuerySql(
            "INSERT INTO tasks (id, value) VALUES ('1', 2) "
                + "ON CONFLICT (id) DO UPDATE SET value = tasks.value RETURNING *",
            { tasks: "tasks_2" },
        );
        expect(result.sql).toBe(
            "INSERT INTO tasks_2 (id, value) VALUES ('1', 2) "
                + "ON CONFLICT (id) DO UPDATE SET value = tasks_2.value RETURNING *",
        );
    });

    it("rewrites a column qualified by a renamed UPDATE target", () => {
        expect(
            rewriteTableQuerySql("UPDATE tasks SET value = tasks.value + 1", { tasks: "tasks_2" }).sql,
        ).toBe("UPDATE tasks_2 SET value = tasks_2.value + 1");
    });

    it("leaves an aliased target's qualifier alone, since the alias replaces the name", () => {
        expect(
            rewriteTableQuerySql("UPDATE tasks AS t SET value = t.value + 1", { tasks: "tasks_2" }).sql,
        ).toBe("UPDATE tasks_2 AS t SET value = t.value + 1");
    });
});

describe("truthful physical dependency boundaries", () => {
    const cases: { name: string; sql: string; names: string[]; reserved?: string[]; }[] = [
        ...["\n", "\r\n", "\r"].map(ending => ({
            name: `line comment ending ${JSON.stringify(ending)}`,
            sql: `SELECT oid AS oid -- comment${ending}FROM pg_class LIMIT 1`,
            names: ["pg_class"],
        })),
        {
            name: "CR before a later LF",
            sql: "SELECT oid AS oid -- comment\rFROM pg_class\nLIMIT 1",
            names: ["pg_class"],
        },
        { name: "EOF comment", sql: "SELECT 1 AS answer -- FROM hidden", names: [] },
        {
            name: "literal CR and comment text",
            sql: "SELECT 'x\r-- FROM hidden' AS text, $$TABLE hidden$$ AS other",
            names: [],
        },
        { name: "TABLE in EXISTS", sql: "SELECT 1 AS answer WHERE EXISTS (TABLE pg_class)", names: ["pg_class"] },
        {
            name: "TABLE in CTE",
            sql: "WITH q AS (TABLE pg_class) SELECT oid AS oid FROM q LIMIT 1",
            names: ["pg_class"],
        },
        {
            name: "TABLE partial dependency",
            sql: "SELECT a.id FROM a WHERE EXISTS (TABLE pg_class)",
            names: ["a", "pg_class"],
        },
        { name: "TABLE statement", sql: "TABLE pg_class", names: ["pg_class"] },
        { name: "parenthesized TABLE", sql: "(TABLE pg_class)", names: ["pg_class"] },
        { name: "TABLE derived FROM query", sql: "SELECT oid FROM (TABLE pg_class) q", names: ["pg_class"] },
        { name: "WITH main TABLE", sql: "WITH q AS (SELECT 1) TABLE pg_class", names: ["pg_class"] },
        { name: "set operation TABLE", sql: "SELECT oid FROM a UNION ALL TABLE pg_class", names: ["a", "pg_class"] },
        {
            name: "set operation distinct",
            sql: "TABLE a INTERSECT DISTINCT TABLE pg_class EXCEPT TABLE b",
            names: ["a", "pg_class", "b"],
        },
        { name: "TABLE ONLY parentheses", sql: 'SELECT 1 WHERE EXISTS (TABLE ONLY ("pg_class"))', names: ["pg_class"] },
        { name: "TABLE of visible CTE", sql: "WITH q AS (SELECT 1) TABLE q", names: [] },
        { name: "reserved TABLE", sql: "TABLE outline_items", names: [], reserved: ["outline_items"] },
        { name: "output alias table", sql: "SELECT 1 AS table, 2 AS pg_class", names: [] },
        { name: "qualified column table", sql: "SELECT a.table, a.pg_class FROM a", names: ["a"] },
        {
            name: "set keyword in qualified expression",
            sql: "SELECT coalesce(a.union, 1) AS table FROM a",
            names: ["a"],
        },
        {
            name: "nonrecursive own name",
            sql: "WITH pg_class AS (SELECT oid FROM pg_class) SELECT oid FROM pg_class",
            names: ["pg_class"],
        },
        {
            name: "later sibling",
            sql: "WITH q AS (SELECT oid FROM pg_class), pg_class AS (SELECT 1 AS oid) SELECT oid FROM q",
            names: ["pg_class"],
        },
        { name: "known Table own name", sql: "WITH a AS (SELECT id FROM a) SELECT id FROM a", names: ["a"] },
        { name: "earlier sibling", sql: "WITH a AS (SELECT 1), q AS (SELECT * FROM a) TABLE q", names: [] },
        {
            name: "enclosing CTE survives inner own name",
            sql: "WITH a AS (SELECT 1) SELECT * FROM (WITH a AS (SELECT * FROM a) TABLE a) q",
            names: [],
        },
        {
            name: "recursive self reference",
            sql: "WITH RECURSIVE a AS (SELECT 1 UNION ALL SELECT * FROM a) TABLE a",
            names: [],
        },
        { name: "recursive later sibling", sql: "WITH RECURSIVE q AS (TABLE a), a AS (SELECT 1) TABLE q", names: [] },
        {
            name: "column lists and materialization",
            sql: "WITH a(id) AS NOT MATERIALIZED (SELECT id FROM a), q AS MATERIALIZED (TABLE a) TABLE q",
            names: ["a"],
        },
    ];
    for (const { name, sql, names, reserved = [] } of cases) {
        it(name, () => {
            const result = rewriteTableQuerySql(sql, new Map());
            expect(result.sql).toBe(sql);
            expect(result.actualRelationDependencies).toEqual(names);
            expect(result.actualReservedRelationDependencies).toEqual(reserved);
        });
    }
    it("remaps only the physical own-name CTE body, including its qualifiers", () => {
        expect(rewriteTableQuerySql("WITH a AS (SELECT a.id FROM a) SELECT a.id FROM a", { a: "a_copy" }).sql)
            .toBe("WITH a AS (SELECT a_copy.id FROM a_copy) SELECT a.id FROM a");
    });
    it("preserves a joined-relation alias that shadows an outer mapped relation", () => {
        const sql = "SELECT tasks.id FROM tasks WHERE EXISTS ("
            + "SELECT 1 FROM (owners JOIN notes ON true) AS tasks WHERE tasks.id = 1)";
        expect(rewriteTableQuerySql(sql, { tasks: "tasks_2", owners: "owners_2", notes: "notes_2" }).sql)
            .toBe(
                "SELECT tasks_2.id FROM tasks_2 WHERE EXISTS ("
                    + "SELECT 1 FROM (owners_2 JOIN notes_2 ON true) AS tasks WHERE tasks.id = 1)",
            );
    });
    it("resolves join conditions before exposing the joined-relation alias", () => {
        const sql = "SELECT tasks.id AS id FROM (tasks JOIN notes ON tasks.id = notes.task_id) AS tasks";
        expect(rewriteTableQuerySql(sql, { tasks: "tasks_2", notes: "notes_2" }).sql).toBe(
            "SELECT tasks.id AS id FROM (tasks_2 JOIN notes_2 ON tasks_2.id = notes_2.task_id) AS tasks",
        );
    });
    it("preserves a JOIN USING alias without hiding its input relations", () => {
        const sql = "SELECT tasks.id AS id FROM tasks WHERE EXISTS ("
            + "SELECT tasks.id AS id FROM a JOIN b USING (id) AS tasks WHERE tasks.id = 1)";
        expect(rewriteTableQuerySql(sql, { tasks: "tasks_2", a: "a_2", b: "b_2" }).sql).toBe(
            "SELECT tasks_2.id AS id FROM tasks_2 WHERE EXISTS ("
                + "SELECT tasks.id AS id FROM a_2 JOIN b_2 USING (id) AS tasks WHERE tasks.id = 1)",
        );
    });
    it("discovers and rewrites subqueries in a set-operation tail", () => {
        const sql = "SELECT id FROM a UNION ALL SELECT id FROM a LIMIT (SELECT count(*) FROM b)";
        const result = rewriteTableQuerySql(sql, { a: "a_copy", b: "b_copy" });
        expect(result.sql).toBe(
            "SELECT id FROM a_copy UNION ALL SELECT id FROM a_copy LIMIT (SELECT count(*) FROM b_copy)",
        );
        expect(result.actualRelationDependencies).toEqual(["a", "b"]);
    });
    it.each(["TABLE public.a", "TABLE ONLY public.a", "TABLE ONLY (public.a)"])("refuses qualified operand %s", sql => {
        expect(() => rewriteTableQuerySql(sql, new Map())).toThrow(/Schema-qualified/);
    });
    it("rejects invalid TABLE syntax instead of returning partial dependencies", () => {
        expect(() => rewriteTableQuerySql('TABLE ONLY "pg_class" *', new Map())).toThrow(/parsing failed/);
    });
    it.each([
        "TABLE a",
        "SELECT 1 WHERE EXISTS (TABLE a)",
        "WITH q AS (SELECT 1) TABLE a",
        "INSERT INTO target TABLE a",
        "INSERT INTO target (id) TABLE a",
        "INSERT INTO target AS t (id) OVERRIDING SYSTEM VALUE TABLE a",
    ])("rewrites mapped TABLE operands in query and Schedule contexts: %s", sql => {
        const result = rewriteTableQuerySql(sql, { a: "a_copy" });
        expect(result.sql).toContain("TABLE a_copy");
        expect(result.actualRelationDependencies).toContain("a");
    });
});
