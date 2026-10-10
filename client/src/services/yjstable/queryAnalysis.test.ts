import { afterAll, describe, expect, it } from "vitest";
import { resetPgliteForTests, TableSqlError } from "./pgliteService";
import { analyzeQueryEditability, assertSelectQuery, resolveBareIdMutationAuthority } from "./queryAnalysis";
import { parseCreateTable } from "./schemaIntrospection";

afterAll(async () => {
    await resetPgliteForTests();
});

describe("resolveBareIdMutationAuthority", () => {
    const schemaPromise = parseCreateTable(
        'CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, "題名" TEXT, points INTEGER)',
    );

    it("rejects an equally shaped sibling relation as a source mismatch", async () => {
        const authority = resolveBareIdMutationAuthority(
            "SELECT id, title FROM other_tasks",
            "tasks",
            await schemaPromise,
            ["id", "title"],
        );
        expect(authority.status).toBe("source-mismatch");
        expect(authority.reason).toMatch(/other_tasks.*source Table/);
    });

    it("proves the required plain single-table projection forms", async () => {
        const schema = await schemaPromise;
        for (
            const query of [
                "SELECT t.id, t.title, t.\"題名\" FROM tasks AS t WHERE t.title <> '' ORDER BY t.title LIMIT 2 OFFSET 1",
                "SELECT * FROM tasks WHERE NOT EXISTS (SELECT 1 FROM tasks later WHERE later.id = tasks.id)",
            ]
        ) {
            const authority = resolveBareIdMutationAuthority(query, "tasks", schema, ["id", "title", "題名", "points"]);
            expect(authority.status, query).toBe("compatible");
            expect(authority.editableColumns.has("title"), query).toBe(true);
        }
    });

    it("rejects comma-joined outer FROM lists as multiple-source results", async () => {
        const schema = await schemaPromise;
        const cases = [
            "SELECT a.id, a.title FROM tasks AS a, other_tasks AS b",
            "SELECT tasks.id, tasks.title FROM tasks, other_tasks",
            "SELECT a.id, a.title FROM tasks AS a, tasks AS b",
            "SELECT a.id, a.title FROM tasks AS a /* join */ , -- line\n other_tasks AS b",
            "SELECT a.id, a.title FROM tasks AS a, other_tasks AS b LIMIT 1",
            "SELECT a.id, a.title FROM tasks AS a, other_tasks AS b WHERE a.title <> ''",
            // PostgreSQL parses nested block comments as one comment, so the
            // comma after the second terminator still joins a second source.
            "SELECT a.id, a.title FROM tasks AS a /* outer /* inner */ WHERE ignored */ , other_tasks AS b LIMIT 1",
            "SELECT a.id, a.title FROM tasks AS a /* outer /* inner /* deep */ still outer */ , other_tasks AS b",
            // PostgreSQL ends a `--` line comment at CR as well as LF, so a
            // comma after a CR-terminated comment still joins a second source
            // (issue #5547: the noise scanner must not swallow it).
            "SELECT a.id, a.title FROM tasks AS a -- comment\r, other_tasks AS b LIMIT 1",
            "SELECT a.id, a.title FROM tasks AS a -- comment\r\n, other_tasks AS b LIMIT 1",
            // A dollar-quoted literal can spoof the outer FROM: its inner
            // FROM/WHERE must not hide the real comma-joined FROM list
            // (issue #5547).
            "SELECT tasks.id, tasks.title, $$ FROM tasks WHERE $$ AS note FROM tasks, other_tasks LIMIT 1",
            "SELECT tasks.id, tasks.title, $note$ FROM tasks WHERE $note$ AS note FROM tasks, other_tasks LIMIT 1",
        ];
        for (const query of cases) {
            const authority = resolveBareIdMutationAuthority(query, "tasks", schema, ["id", "title"]);
            expect(authority.status, query).toBe("unavailable");
            expect(authority.reason, query).toMatch(/multiple sources|several tables/);
        }
    });

    it("keeps comma-bearing single-table queries writable", async () => {
        const schema = await schemaPromise;
        const cases: Array<{ query: string; columns: string[]; }> = [
            { query: "SELECT id, title FROM tasks ORDER BY title, id LIMIT 10 OFFSET 0", columns: ["id", "title"] },
            {
                query: "SELECT id, title, coalesce(title, '') AS display_title FROM tasks",
                columns: ["id", "title", "display_title"],
            },
            { query: "SELECT id, title FROM tasks WHERE title <> 'a,b'", columns: ["id", "title"] },
            {
                query: "SELECT id, title FROM tasks WHERE id IN (SELECT id FROM other_tasks WHERE title = 'x,y')",
                columns: ["id", "title"],
            },
            { query: "SELECT * FROM tasks", columns: ["id", "title", "題名", "points"] },
            { query: "  SELECT id, title FROM tasks  ", columns: ["id", "title"] },
            // A comma inside a dollar-quoted literal is not a second FROM
            // source, so the single-table result stays writable.
            { query: "SELECT id, title FROM tasks WHERE title <> $$a,b$$", columns: ["id", "title"] },
        ];
        for (const { query, columns } of cases) {
            const authority = resolveBareIdMutationAuthority(query, "tasks", schema, columns);
            expect(authority.status, query).toBe("compatible");
            expect(authority.editableColumns.has("title"), query).toBe(true);
        }
    });

    it("does not authorize calculated, renamed, CTE, or synthetic identity outputs", async () => {
        const schema = await schemaPromise;
        const cases = [
            "SELECT 'same-id' AS id, title FROM tasks",
            "SELECT id, points * 2 AS title FROM tasks",
            "WITH tasks AS (SELECT * FROM other_tasks) SELECT id, title FROM tasks",
        ];
        for (const query of cases) {
            const authority = resolveBareIdMutationAuthority(query, "tasks", schema, ["id", "title"]);
            if (query.includes("points")) {
                expect(authority.status).toBe("compatible");
                expect(authority.editableColumns.has("title")).toBe(false);
            } else expect(authority.status).toBe("unavailable");
        }
    });
});

describe("assertSelectQuery", () => {
    it("accepts plain SELECT statements", () => {
        expect(assertSelectQuery("SELECT id FROM t")).toBe("SELECT id FROM t");
    });

    it("rejects mutations and multiple statements", () => {
        expect(() => assertSelectQuery("DELETE FROM t")).toThrow(TableSqlError);
        expect(() => assertSelectQuery("SELECT 1; SELECT 2")).toThrow(/exactly one/);
        expect(() => assertSelectQuery("SELECT 1; DROP TABLE t")).toThrow(TableSqlError);
        expect(() => assertSelectQuery("")).toThrow(/empty/);
    });

    it("ignores keywords inside string literals", () => {
        expect(assertSelectQuery("SELECT 'delete me' AS label FROM t")).toBeTruthy();
    });
});

describe("analyzeQueryEditability", () => {
    const schemaPromise = parseCreateTable(
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, points INTEGER)",
    );

    it("marks plain projections of schema columns editable (id excluded)", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability("SELECT id, title, points FROM tasks", schema, [
            "id",
            "title",
            "points",
        ]);
        expect(res.editable).toBe(true);
        expect([...res.editableColumns].sort()).toEqual(["points", "title"]);
    });

    it("is read-only without an id column in the result", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability("SELECT title FROM tasks", schema, ["title"]);
        expect(res.editable).toBe(false);
        expect(res.readOnlyReason).toMatch(/id column/);
    });

    it("is read-only for JOIN and aggregate queries", async () => {
        const schema = await schemaPromise;
        expect(
            analyzeQueryEditability("SELECT t.id FROM tasks t JOIN tasks u ON u.id = t.id", schema, ["id"])
                .editable,
        ).toBe(false);
        expect(
            analyzeQueryEditability("SELECT id, COUNT(*) AS n FROM tasks GROUP BY id", schema, ["id", "n"])
                .editable,
        ).toBe(false);
    });

    it("is read-only for comma-joined outer FROM lists even without an authority verdict", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability(
            "SELECT a.id, a.title FROM tasks AS a, tasks AS b",
            schema,
            ["id", "title"],
        );
        expect(res.editable).toBe(false);
        expect(res.readOnlyReason).toMatch(/several tables|multiple sources/);
    });

    it("is read-only for a comma join hidden behind a nested block comment", async () => {
        const schema = await schemaPromise;
        const query = "SELECT a.id, a.title FROM tasks AS a /* outer /* inner */ WHERE ignored */ , tasks AS b LIMIT 1";
        const res = analyzeQueryEditability(query, schema, ["id", "title"]);
        expect(res.editable).toBe(false);
        expect(res.readOnlyReason).toMatch(/several tables|multiple sources/);
    });

    it("treats calculated columns as read-only", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability(
            "SELECT id, title, points * 2 AS doubled FROM tasks",
            schema,
            ["id", "title", "doubled"],
        );
        expect(res.editable).toBe(true);
        expect(res.editableColumns.has("doubled")).toBe(false);
        expect(res.editableColumns.has("title")).toBe(true);
    });

    // The demo's routine occurrences table shows only the newest occurrence of
    // each task with a correlated NOT EXISTS. That must stay editable so the
    // completion checkbox can be ticked (DISTINCT ON / MAX would not).
    it("keeps a latest-per-key NOT EXISTS query editable", async () => {
        const schema = await parseCreateTable(
            "CREATE TABLE routine_occurrences (id TEXT PRIMARY KEY, template_id TEXT, occurrence_date DATE, done BOOLEAN)",
        );
        const query = "SELECT id, template_id, occurrence_date, done FROM routine_occurrences r "
            + "WHERE NOT EXISTS (SELECT 1 FROM routine_occurrences later "
            + "WHERE later.template_id = r.template_id AND later.occurrence_date > r.occurrence_date)";

        const res = analyzeQueryEditability(query, schema, ["id", "template_id", "occurrence_date", "done"]);
        expect(res.editable).toBe(true);
        expect(res.editableColumns.has("done")).toBe(true);
    });

    it("is read-only when no schema is applied", () => {
        const res = analyzeQueryEditability("SELECT id FROM t", undefined, ["id"]);
        expect(res.editable).toBe(false);
    });

    it('marks a bare-id single-table result addressed by "id"', async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability("SELECT id, title FROM tasks", schema, ["id", "title"]);
        expect(res.editable).toBe(true);
        expect(res.rowIdentity).toBe("id");
    });

    // A calendar-style query unions outline items with generated rows. Neither
    // side has a single `id` column tracing back to one relation, but the pair
    // survives the projection so the result stays editable (issue #4273).
    it('keeps a UNION carrying source_kind/source_id editable, addressed by "source"', async () => {
        const schema = await schemaPromise;
        const query = "SELECT 'a' AS source_kind, id AS source_id, title, points FROM tasks "
            + "UNION ALL SELECT 'b' AS source_kind, id AS source_id, title, points FROM tasks";
        const res = analyzeQueryEditability(query, schema, ["source_kind", "source_id", "title", "points"]);
        expect(res.editable).toBe(true);
        expect(res.rowIdentity).toBe("source");
        expect([...res.editableColumns].sort()).toEqual(["points", "title"]);
        expect(res.editableColumns.has("source_kind")).toBe(false);
        expect(res.editableColumns.has("source_id")).toBe(false);
    });

    it("is read-only when only one half of source_kind/source_id is present", async () => {
        const schema = await schemaPromise;
        const withoutId = analyzeQueryEditability(
            "SELECT 'a' AS source_kind, title FROM tasks",
            schema,
            ["source_kind", "title"],
        );
        expect(withoutId.editable).toBe(false);
        expect(withoutId.readOnlyReason).toMatch(/source_kind.*source_id/);

        const withoutKind = analyzeQueryEditability(
            "SELECT id AS source_id, title FROM tasks",
            schema,
            ["source_id", "title"],
        );
        expect(withoutKind.editable).toBe(false);
        expect(withoutKind.readOnlyReason).toMatch(/source_kind.*source_id/);
    });

    it("keeps aggregated/grouped unioned results read-only", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability(
            "SELECT 'a' AS source_kind, id AS source_id, COUNT(*) AS n FROM tasks GROUP BY id",
            schema,
            ["source_kind", "source_id", "n"],
        );
        expect(res.editable).toBe(false);
    });

    it("treats an aliased/calculated column as read-only within an otherwise editable union", async () => {
        const schema = await schemaPromise;
        const res = analyzeQueryEditability(
            "SELECT 'a' AS source_kind, id AS source_id, points * 2 AS doubled FROM tasks",
            schema,
            ["source_kind", "source_id", "doubled"],
        );
        expect(res.editable).toBe(true);
        expect(res.editableColumns.has("doubled")).toBe(false);
    });
});
