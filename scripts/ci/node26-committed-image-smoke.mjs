import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.versions.node.split(".")[0], "26");
const serverRequire = createRequire(path.resolve("server/package.json"));
const extensionRequire = createRequire(serverRequire.resolve("@hocuspocus/extension-sqlite"));
const directPath = serverRequire.resolve("better-sqlite3");
const extensionPath = extensionRequire.resolve("better-sqlite3");
assert.notEqual(directPath, extensionPath, "exercise both installed SQLite copies");
for (const [name, requireFrom] of [["server", serverRequire], ["hocuspocus", extensionRequire]]) {
    const Database = requireFrom("better-sqlite3");
    const db = new Database(":memory:");
    db.exec("CREATE TABLE test (value INTEGER NOT NULL)");
    db.prepare("INSERT INTO test VALUES (?)").run(42);
    assert.equal(db.prepare("SELECT value FROM test").get().value, 42);
    db.close();
    console.log(`${name} SQLite read/write passed`);
}
const { PGlite } = await import(pathToFileURL(serverRequire.resolve("@electric-sql/pglite")).href);
const database = new PGlite();
assert.equal((await database.query("SELECT 42::integer AS value")).rows[0].value, 42);
await database.close();
const { parse } = await import(pathToFileURL(serverRequire.resolve("libpg-query")).href);
const ast = await parse("SELECT 42");
assert.ok(ast.stmts[0].stmt.SelectStmt);
console.log("PGlite query and libpg-query parse passed");
