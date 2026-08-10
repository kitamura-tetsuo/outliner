import { describe, expect, it } from "vitest";
import { rewriteCreateTableSql, rewriteTableQuerySql, TableSqlRewriteError } from "./tableSqlRewrite";

describe("rewriteCreateTableSql", () => {
    it("rewrites only the CREATE TABLE relation and preserves formatting, comments, columns, and literals", () => {
        const sql =
            `-- keep sales in this comment\nCREATE  TABLE  sales (\n  sales TEXT DEFAULT 'sales',\n  note TEXT\n);`;
        expect(rewriteCreateTableSql(sql, "sales", "sales_2")).toEqual({
            sql: `-- keep sales in this comment\nCREATE  TABLE  sales_2 (\n  sales TEXT DEFAULT 'sales',\n  note TEXT\n);`,
            relationDependencies: [],
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

    it("rejects schema-qualified and ambiguous copied relation constructs", () => {
        expect(() => rewriteTableQuerySql("SELECT * FROM public.sales", { sales: "sales_2" }))
            .toThrow(TableSqlRewriteError);
        expect(() => rewriteTableQuerySql("SELECT * FROM sales()", { sales: "sales_2" }))
            .toThrow(/ambiguous/);
        expect(() => rewriteTableQuerySql("SELECT * FROM (sales JOIN customers ON true)", { sales: "sales_2" }))
            .toThrow(/Parenthesized joined relation/);
        expect(() => rewriteTableQuerySql("TABLE sales", { sales: "sales_2" }))
            .toThrow(/not supported/);
        expect(() => rewriteTableQuerySql("SELECT * FROM sales; SELECT 1", { sales: "sales_2" }))
            .toThrow(/Multiple SQL statements/);
    });
});
