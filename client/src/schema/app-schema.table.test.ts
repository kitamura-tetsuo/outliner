import { describe, expect, it } from "vitest";
import { Item } from "./app-schema";

describe("Item SQL table persistence", () => {
    it("defaults to empty schema, columns and rows", () => {
        const item = new Item({ text: "grid" });
        expect(item.tableSchema).toBeUndefined();
        expect(item.tableColumns).toEqual([]);
        expect(item.tableRows.length).toBe(0);
    });

    it("defineTable stores the SQL and column order", () => {
        const item = new Item({ text: "grid" });
        item.defineTable("CREATE TABLE t (a TEXT, b TEXT)", ["a", "b"]);
        expect(item.tableSchema).toBe("CREATE TABLE t (a TEXT, b TEXT)");
        expect(item.tableColumns).toEqual(["a", "b"]);
    });

    it("adds, edits and deletes rows", () => {
        const item = new Item({ text: "grid" });
        item.defineTable("CREATE TABLE t (a TEXT, b TEXT)", ["a", "b"]);

        item.tableRows.addRow({ a: "1", b: "x" });
        item.tableRows.addRow({ a: "2" });
        expect(item.tableRows.length).toBe(2);

        item.tableRows.updateCell(1, "b", "y");
        const plain = item.tableRows.toPlain(item.tableColumns);
        expect(plain).toEqual([
            { a: "1", b: "x" },
            { a: "2", b: "y" },
        ]);

        item.tableRows.deleteRow(0);
        expect(item.tableRows.toPlain(item.tableColumns)).toEqual([{ a: "2", b: "y" }]);
    });

    it("defineTable resets existing rows for the new schema", () => {
        const item = new Item({ text: "grid" });
        item.defineTable("CREATE TABLE t (a TEXT)", ["a"]);
        item.tableRows.addRow({ a: "1" });
        expect(item.tableRows.length).toBe(1);

        item.defineTable("CREATE TABLE t2 (x TEXT, y TEXT)", ["x", "y"]);
        expect(item.tableColumns).toEqual(["x", "y"]);
        expect(item.tableRows.length).toBe(0);
    });
});
