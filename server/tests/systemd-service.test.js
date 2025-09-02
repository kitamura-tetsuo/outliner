const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("systemd service file contains hardening directives", () => {
    const servicePath = path.join(__dirname, "..", "systemd", "outliner.service");
    const content = fs.readFileSync(servicePath, "utf8");
    assert.match(content, /Restart=on-failure/);
    assert.match(content, /NoNewPrivileges=yes/);
    assert.match(content, /ProtectSystem=strict/);
    assert.match(content, /EnvironmentFile=\/etc\/outliner\/outliner.env/);
});
