import { PGlite } from "@electric-sql/pglite";
import { expect } from "chai";
import { boundGridRelations } from "../src/mcp/grid-query-evidence.js";

describe("native Grid bindings", function() {
    this.timeout(30000);
    let db: PGlite;
    before(async () => {
        db = new PGlite();
        await db.exec("CREATE TABLE a(id text); CREATE TABLE b(id text)");
    });
    after(async () => {
        await db.close();
    });
    for (
        const query of [
            "SELECT * FROM a UNION ALL SELECT * FROM b WHERE FALSE",
            "SELECT * FROM (SELECT * FROM a UNION ALL SELECT * FROM b) q LIMIT 1",
            "SELECT a.* FROM a WHERE EXISTS (SELECT 1 FROM b)",
        ]
    ) {
        it(`retains native bindings: ${query}`, async () => {
            expect(await boundGridRelations(db, query, 1, ["a", "b"])).to.deep.equal({
                status: "proven",
                relations: ["a", "b"],
            });
        });
    }
    it("distinguishes constants from pinned catalog reads", async () => {
        expect(await boundGridRelations(db, "SELECT 1 AS answer", 1, [])).to.deep.equal({
            status: "proven",
            relations: [],
        });
        expect((await boundGridRelations(db, "SELECT oid FROM pg_catalog.pg_class", 1, [])).status).to.equal("unknown");
    });
    it("supports duplicate names and always removes the probe", async () => {
        await boundGridRelations(db, "SELECT a.id, b.id FROM a CROSS JOIN b", 2, ["a", "b"]);
        try {
            await boundGridRelations(db, "SELECT * FROM missing", 1, []);
        } catch {}
        const result = await db.query(
            "SELECT relname FROM pg_class WHERE relnamespace = pg_my_temp_schema() AND relkind = 'v'",
        );
        expect(result.rows).to.deep.equal([]);
    });
});
