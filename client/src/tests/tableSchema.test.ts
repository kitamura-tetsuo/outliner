import { beforeAll, describe, expect, it } from "vitest";

import { initDb } from "../services/sqlService";
import { parseCreateTable } from "../services/tableSchema";

describe("parseCreateTable", () => {
    beforeAll(async () => {
        // Ensure the sql.js engine is initialized (shares WASM loading).
        await initDb();
    });

    it("extracts table name and column metadata", async () => {
        const parsed = await parseCreateTable(
            "CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT, done INTEGER)",
        );
        expect(parsed.tableName).toBe("tasks");
        expect(parsed.columns.map(c => c.name)).toEqual(["id", "title", "done"]);
        expect(parsed.columns[0]).toEqual({ name: "id", type: "INTEGER", pk: true });
        expect(parsed.columns[1].pk).toBe(false);
    });

    it("does not pollute the shared query database", async () => {
        // Parsing creates a table in an isolated DB; the name must stay private.
        await parseCreateTable("CREATE TABLE isolated_probe (id INTEGER)");
        const second = await parseCreateTable("CREATE TABLE isolated_probe (id INTEGER, extra TEXT)");
        // A second parse with the same name must succeed (proving isolation).
        expect(second.columns.map(c => c.name)).toEqual(["id", "extra"]);
    });

    it("rejects empty input", async () => {
        await expect(parseCreateTable("   ")).rejects.toThrow(/empty/i);
    });

    it("rejects non-CREATE-TABLE statements", async () => {
        await expect(parseCreateTable("SELECT 1")).rejects.toThrow(/CREATE TABLE/i);
    });

    it("rejects invalid SQL", async () => {
        await expect(parseCreateTable("CREATE TABLE broken (")).rejects.toThrow();
    });
});
