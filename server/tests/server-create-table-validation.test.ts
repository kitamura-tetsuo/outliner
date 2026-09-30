import { expect } from "chai";
import fs from "fs-extra";
import {
    AclStore,
    projectState,
    rejection,
    seedProject,
    startTestServer,
    stopTestServer,
    storedRooms,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

const UID = "user-1";

// Issue #5411 AS-002: schema and name validation happen before publication,
// through the real server boundary, and never leave a placeholder behind.
describe("standalone Table creation schema validation (#5411 AS-002)", function() {
    this.timeout(60000);
    let dir: string;
    let server: TestServer;

    before(async () => {
        const acl = new AclStore();
        acl.grant("projectUsers", "proj-a", UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, "proj-a");
    });

    after(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const create = (schemaSql: unknown, name: unknown = "Tasks", extra: Record<string, unknown> = {}) =>
        server.tableCreation.createTable(UID, "proj-a", { name, schemaSql, ...extra } as never);

    const refusals: [string, unknown, string][] = [
        ["malformed SQL", "CREATE TABLE broken (id TEXT", "validation_failed"],
        ["whitespace-only SQL", "   \n\t", "invalid_argument"],
        ["an oversized UTF-8 schema", `CREATE TABLE big (id TEXT) -- ${"é".repeat(8200)}`, "size_limit"],
        ["a second statement", "CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT)", "validation_failed"],
        ["a trailing DDL script", "CREATE TABLE a (id TEXT); DROP TABLE a", "validation_failed"],
        ["a schema-qualified target", "CREATE TABLE public.tasks (id TEXT)", "validation_failed"],
        ["a reserved outline_items target", "CREATE TABLE outline_items (id TEXT)", "validation_failed"],
        ["CREATE TABLE AS", "CREATE TABLE copy AS SELECT 1 AS id WHERE false", "validation_failed"],
        ["a temporary table", "CREATE TEMP TABLE scratch (id TEXT)", "validation_failed"],
        ["an unlogged table", "CREATE UNLOGGED TABLE scratch (id TEXT)", "validation_failed"],
        ["a table without columns", "CREATE TABLE empty_cols ()", "validation_failed"],
        ["a name outside the SQL-name domain", 'CREATE TABLE "has space" (id TEXT)', "validation_failed"],
        [
            "a declaration that cannot execute in isolation",
            "CREATE TABLE child (id TEXT) INHERITS (existing_table)",
            "validation_failed",
        ],
        ["an unknown column type", "CREATE TABLE typed (id no_such_type)", "validation_failed"],
        ["a non-string schema", 42, "invalid_argument"],
    ];

    for (const [label, schemaSql, code] of refusals) {
        it(`refuses ${label} before publication and leaves the project unchanged`, async () => {
            const before = await withRoom(server.hocuspocus, "projects/proj-a", projectState);
            const roomsBefore = storedRooms(dir);
            const error = await rejection(create(schemaSql));
            expect(error.code).to.equal(code);
            expect(await withRoom(server.hocuspocus, "projects/proj-a", projectState)).to.deep.equal(before);
            // Validation never reaches Table-room preparation.
            expect(storedRooms(dir)).to.deep.equal(roomsBefore);
        });
    }

    it("rejects malformed requests and any separate SQL-name authority", async () => {
        const nameless = server.tableCreation.createTable(
            UID,
            "proj-a",
            { schemaSql: "CREATE TABLE a (id TEXT)" } as never,
        );
        expect((await rejection(nameless)).code).to.equal("invalid_argument");
        expect((await rejection(create("CREATE TABLE a (id TEXT)", 7))).code).to.equal("invalid_argument");
        expect((await rejection(create("CREATE TABLE a (id TEXT)", "A", { sqlName: "b" }))).code)
            .to.equal("invalid_argument");
        expect((await rejection(create("CREATE TABLE a (id TEXT)", "A", { dryRun: "yes" }))).code)
            .to.equal("invalid_argument");
        for (const projectId of ["", "bad/id", "x".repeat(129)]) {
            const error = await rejection(
                server.tableCreation.createTable(UID, projectId, { name: "A", schemaSql: "CREATE TABLE a (id TEXT)" }),
            );
            expect(error.code).to.equal("invalid_argument");
        }
    });

    it("accepts quoted identifiers, comments, and semicolons inside literals as one declaration", async () => {
        const schemaSql = `-- planning table; with a comment
CREATE TABLE plan_items (
    id TEXT PRIMARY KEY,
    "order" INTEGER, /* nested /* block; */ comment */
    note TEXT DEFAULT $$a;b$$,
    status TEXT CHECK (status IN ('open;', 'done'))
);`;
        const created = await create(schemaSql, "Plan");
        expect(created).to.include({ status: "created", sqlName: "plan_items", schemaSql });
    });

    it("resolves unquoted names to lower case and keeps quoted names exact", async () => {
        const lower = await create("CREATE TABLE TASKS (id TEXT)", "Upper");
        expect(lower).to.include({ status: "created", sqlName: "tasks" });
        const quoted = await create('CREATE TABLE "Tasks" (id TEXT)', "Quoted");
        expect(quoted).to.include({ status: "created", sqlName: "Tasks" });
    });

    it("refuses a catalog-resolved name that is already claimed, even with IF NOT EXISTS", async () => {
        const before = await withRoom(server.hocuspocus, "projects/proj-a", projectState);
        const error = await rejection(create("CREATE TABLE IF NOT EXISTS EXISTING_TABLE (id TEXT)"));
        expect(error.code).to.equal("validation_failed");
        expect(error.debug).to.include({ code: "relation_name_unavailable", sqlName: "existing_table" });
        expect(await withRoom(server.hocuspocus, "projects/proj-a", projectState)).to.deep.equal(before);
    });
});
