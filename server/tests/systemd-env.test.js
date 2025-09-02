const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

test("systemd environment example parses variables", () => {
    const envPath = path.join(__dirname, "..", "systemd", "outliner.env.example");
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    assert.ok(parsed.PORT);
    assert.ok(parsed.LOCAL_HOST);
    assert.ok(parsed.LEVELDB_PATH);
});
