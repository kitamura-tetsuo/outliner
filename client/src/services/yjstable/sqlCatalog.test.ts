import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { enqueueWrite, resetPgliteForTests, TableSqlError } from "./pgliteService";
import { parseCreateTable } from "./schemaIntrospection";
import {
    assertSingleCreateTypeEnum,
    catalogTypeNameError,
    createCatalogEntry,
    ensureCatalogTypes,
    findCatalogIdByTypeName,
    getCatalogSource,
    listCatalogEntries,
    parseCreateTypeEnum,
    readCatalogSources,
    removeCatalogEntry,
    renameCatalogEntry,
    setCatalogSource,
} from "./sqlCatalog";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { TableSyncAdapter } from "./tableSyncAdapter";

afterAll(async () => {
    await resetPgliteForTests();
});

describe("assertSingleCreateTypeEnum", () => {
    it("accepts a single CREATE TYPE AS ENUM statement", () => {
        expect(
            assertSingleCreateTypeEnum(
                "CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad');",
            ),
        ).toBe("CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad');");
    });

    it("rejects empty input", () => {
        expect(() => assertSingleCreateTypeEnum("   ")).toThrow(TableSqlError);
    });

    it("rejects non-CREATE TYPE statements", () => {
        expect(() => assertSingleCreateTypeEnum("SELECT 1")).toThrow(/CREATE TYPE/);
        expect(() => assertSingleCreateTypeEnum("CREATE TABLE t (id TEXT)")).toThrow(/CREATE TYPE/);
    });

    it("rejects multiple statements", () => {
        expect(() => assertSingleCreateTypeEnum("CREATE TYPE a AS ENUM ('x'); DROP TYPE a")).toThrow(
            /exactly one statement/,
        );
    });

    it("rejects schema-qualified type names", () => {
        expect(() => assertSingleCreateTypeEnum("CREATE TYPE public.mood AS ENUM ('x')")).toThrow(
            /Schema-qualified/,
        );
    });

    it("rejects non-ENUM type definitions", () => {
        expect(() => assertSingleCreateTypeEnum("CREATE TYPE mood AS RANGE (SUBTYPE = text)")).toThrow(
            /only ENUM types are supported/,
        );
    });

    it("rejects type names that need quoting", () => {
        expect(() => assertSingleCreateTypeEnum("CREATE TYPE Mood AS ENUM ('x')")).toThrow(
            /lower case/,
        );
    });

    it("ignores semicolons inside labels and comments", () => {
        const sql = "CREATE TYPE mood AS ENUM (\n  -- a comment; with semicolon\n  'a;b', 'c'\n)";
        expect(assertSingleCreateTypeEnum(sql)).toBe(sql);
    });
});

describe("parseCreateTypeEnum (PGlite introspection)", () => {
    it("returns the type name and its labels in order", async () => {
        const parsed = await parseCreateTypeEnum(
            "CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad')",
        );
        expect(parsed.typeName).toBe("mood");
        expect(parsed.labels).toEqual(["happy", "neutral", "sad"]);
    });

    it("rejects an ENUM without labels", async () => {
        await expect(parseCreateTypeEnum("CREATE TYPE empty_mood AS ENUM ()")).rejects.toThrow(
            TableSqlError,
        );
    });
});

describe("catalog registry", () => {
    it("creates, lists, renames and removes entries", () => {
        const projectDoc = new Y.Doc();
        const id = createCatalogEntry(
            projectDoc,
            "Mood",
            "CREATE TYPE mood AS ENUM ('happy', 'sad')",
        );
        expect(listCatalogEntries(projectDoc)).toEqual([
            { catalogId: id, name: "Mood", source: "CREATE TYPE mood AS ENUM ('happy', 'sad')" },
        ]);
        expect(getCatalogSource(projectDoc, id)).toContain("CREATE TYPE mood");

        setCatalogSource(projectDoc, id, "CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad')");
        expect(getCatalogSource(projectDoc, id)).toContain("neutral");

        renameCatalogEntry(projectDoc, id, "Moods");
        expect(listCatalogEntries(projectDoc)[0].name).toBe("Moods");

        expect(removeCatalogEntry(projectDoc, id)).toBe(true);
        expect(listCatalogEntries(projectDoc)).toEqual([]);
        expect(removeCatalogEntry(projectDoc, id)).toBe(false);
    });

    it("reads sources for the engine, skipping blanks", () => {
        const projectDoc = new Y.Doc();
        expect(readCatalogSources(projectDoc)).toEqual([]);
        expect(readCatalogSources(undefined)).toEqual([]);
        createCatalogEntry(projectDoc, "Mood", "CREATE TYPE mood AS ENUM ('happy')");
        createCatalogEntry(projectDoc, "Blank", "   ");
        expect(readCatalogSources(projectDoc)).toEqual(["CREATE TYPE mood AS ENUM ('happy')"]);
    });

    it("resolves a type name to its declaring entry", () => {
        const projectDoc = new Y.Doc();
        const id = createCatalogEntry(projectDoc, "Mood", "CREATE TYPE mood AS ENUM ('happy')");
        expect(findCatalogIdByTypeName(projectDoc, "mood")).toBe(id);
        expect(findCatalogIdByTypeName(projectDoc, "missing")).toBeUndefined();
    });

    it("rejects type names taken by tables or sibling entries", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Moods", "moods", (handles) => {
            handles.schemaText.insert(0, "CREATE TABLE moods (id TEXT PRIMARY KEY)");
        });
        const id = createCatalogEntry(projectDoc, "Other", "CREATE TYPE other AS ENUM ('x')");
        // A table of the project already uses the name.
        expect(catalogTypeNameError(projectDoc, id, "moods")).toMatch(/already used by table/);
        // The entry's own declaration is not a conflict with itself.
        expect(catalogTypeNameError(projectDoc, id, "other")).toBeUndefined();
        // A sibling catalog entry declaring the same name is.
        const second = createCatalogEntry(projectDoc, "Dup", "CREATE TYPE other AS ENUM ('y')");
        expect(catalogTypeNameError(projectDoc, second, "other")).toMatch(/already declared/);
        // Pattern and reserved-word rules still apply.
        expect(catalogTypeNameError(projectDoc, id, "Mood")).toMatch(/lower case/);
        expect(catalogTypeNameError(projectDoc, id, "outline_items")).toMatch(/reserved/);
    });
});

describe("catalog ENUM end to end (real engine)", () => {
    it("materializes a catalog type so a table schema can use it", async () => {
        await enqueueWrite(async (db) => {
            await db.exec(`DROP SCHEMA IF EXISTS "__sqlcatalog_e2e__" CASCADE;`);
            await db.exec(`CREATE SCHEMA "__sqlcatalog_e2e__";`);
            await ensureCatalogTypes(db, "__sqlcatalog_e2e__", [
                "CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad')",
                // One broken draft must not take down the valid types.
                "CREATE TABLE not_a_type (id TEXT)",
            ]);
            // The table build the adapter runs now resolves the ENUM name.
            await db.exec(
                `BEGIN; SET LOCAL search_path TO "__sqlcatalog_e2e__"; `
                    + `CREATE TABLE diary (id TEXT PRIMARY KEY, mood mood NOT NULL); COMMIT;`,
            );
            await db.query(`INSERT INTO "__sqlcatalog_e2e__".diary (id, mood) VALUES ($1, $2)`, [
                "r1",
                "happy",
            ]);
            const rows = await db.query<{ mood: string; }>(
                `SELECT mood FROM "__sqlcatalog_e2e__".diary`,
            );
            expect(rows.rows).toEqual([{ mood: "happy" }]);
            // An unknown label is rejected by the engine, not silently stored.
            await expect(
                db.query(`INSERT INTO "__sqlcatalog_e2e__".diary (id, mood) VALUES ($1, $2)`, [
                    "r2",
                    "ecstatic",
                ]),
            ).rejects.toThrow();
            await db.exec(`DROP SCHEMA IF EXISTS "__sqlcatalog_e2e__" CASCADE;`);
        });
    });

    it("validates a table schema that references a catalog type", async () => {
        const parsed = await parseCreateTable(
            "CREATE TABLE diary (id TEXT PRIMARY KEY, mood mood NOT NULL)",
            ["CREATE TYPE mood AS ENUM ('happy', 'neutral', 'sad')"],
        );
        expect(parsed.tableName).toBe("diary");
        expect(parsed.columns.map((column) => column.name)).toEqual(["id", "mood"]);
    });

    it("applies a table schema through the real adapter against the project catalog", async () => {
        const projectDoc = new Y.Doc();
        createCatalogEntry(projectDoc, "Mood", "CREATE TYPE mood AS ENUM ('happy', 'sad')");
        const tableId = createTable(projectDoc, "Diary", "diary");
        const handles = getTableHandles(projectDoc, tableId)!;
        setSchemaText(handles, "CREATE TABLE diary (id TEXT PRIMARY KEY, mood mood NOT NULL)");

        const adapter = new TableSyncAdapter(handles, {
            pgSchema: projectSchemaName(projectDoc.guid),
            projectDoc,
        });
        let schemaError: string | undefined;
        let recordErrors: { recordId: string; message: string; }[] = [];
        adapter.subscribe({
            onSchemaChanged: (_schema, error) => {
                schemaError = error;
            },
            onRecordErrors: (errors) => {
                recordErrors = errors;
            },
        });
        try {
            await adapter.start();
            expect(schemaError).toBeUndefined();
            expect(adapter.appliedSchema?.tableName).toBe("diary");

            addRecord(handles, { mood: "happy" });
            // Let the adapter's microtask flush chain its write before the query.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const result = await adapter.runQueryNow("SELECT id, mood FROM diary");
            expect(result?.rows).toHaveLength(1);
            expect(result?.rows[0].mood).toBe("happy");

            // An unknown label is a per-record sync error, never a silent store.
            addRecord(handles, { mood: "ecstatic" });
            await new Promise((resolve) => setTimeout(resolve, 0));
            await adapter.runQueryNow("SELECT id, mood FROM diary");
            expect(recordErrors.length).toBeGreaterThan(0);
            const again = await adapter.runQueryNow("SELECT id, mood FROM diary");
            expect(again?.rows).toHaveLength(1);
        } finally {
            adapter.dispose();
        }
    });
});
