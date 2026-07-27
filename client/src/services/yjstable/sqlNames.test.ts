import { describe, expect, it } from "vitest";
import {
    deriveSqlName,
    isValidSqlName,
    projectSchemaName,
    quoteIdent,
    reservedRelationNameError,
    sqlNameError,
} from "./sqlNames";

describe("sqlNameError", () => {
    it("accepts plain lower-case identifiers", () => {
        expect(isValidSqlName("sales")).toBe(true);
        expect(isValidSqlName("sales_2026")).toBe(true);
        expect(isValidSqlName("_internal")).toBe(true);
    });

    it("rejects names that would need quoting", () => {
        expect(sqlNameError("Sales")).toMatch(/lower case/);
        expect(sqlNameError("sales 2026")).toMatch(/lower case/);
        expect(sqlNameError("売上")).toMatch(/lower case/);
        expect(sqlNameError("2026_sales")).toMatch(/lower case/);
    });

    it("rejects reserved words and empty names", () => {
        expect(sqlNameError("order")).toMatch(/reserved/);
        expect(sqlNameError("user")).toMatch(/reserved/);
        expect(sqlNameError("")).toMatch(/required/);
    });

    it("rejects the name of the system items relation", () => {
        expect(sqlNameError("items")).toMatch(/reserved/);
        expect(reservedRelationNameError("items")).toMatch(/outline items/);
        expect(reservedRelationNameError("item")).toBeUndefined();
        expect(reservedRelationNameError("items_2")).toBeUndefined();
    });

    it("rejects names longer than the Postgres identifier limit", () => {
        expect(sqlNameError("a".repeat(63))).toBeUndefined();
        expect(sqlNameError("a".repeat(64))).toMatch(/at most/);
    });
});

describe("deriveSqlName", () => {
    it("builds an identifier out of a display name", () => {
        expect(deriveSqlName("Sales 2026")).toBe("sales_2026");
        expect(deriveSqlName("  Customer  Notes  ")).toBe("customer_notes");
        expect(deriveSqlName("order")).toBe("order_table");
        expect(deriveSqlName("Items")).toBe("items_table");
    });

    it("falls back for display names without ASCII characters", () => {
        expect(deriveSqlName("売上管理")).toBe("data");
        expect(deriveSqlName("2026")).toBe("t_2026");
    });

    it("avoids names already used in the project", () => {
        expect(deriveSqlName("Tasks", ["tasks"])).toBe("tasks_2");
        expect(deriveSqlName("Tasks", ["tasks", "tasks_2"])).toBe("tasks_3");
        expect(deriveSqlName("売上", ["data", "data_2"])).toBe("data_3");
    });

    it("produces a valid identifier for every derived name", () => {
        for (const input of ["Sales 2026", "売上管理", "order", "###", "2026"]) {
            expect(isValidSqlName(deriveSqlName(input))).toBe(true);
        }
    });
});

describe("projectSchemaName", () => {
    it("gives each project its own schema so names never collide across projects", () => {
        expect(projectSchemaName("abc-123")).toBe("p_abc_123");
        expect(projectSchemaName("abc-123")).not.toBe(projectSchemaName("abc-124"));
        expect(projectSchemaName(undefined)).toBe("yjs_tables_local");
    });
});

describe("quoteIdent", () => {
    it("escapes embedded double quotes", () => {
        expect(quoteIdent("sales")).toBe('"sales"');
        expect(quoteIdent('we"ird')).toBe('"we""ird"');
    });
});
